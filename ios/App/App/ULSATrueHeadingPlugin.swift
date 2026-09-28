import Capacitor
import CoreLocation
import Foundation
import UIKit

@objc(ULSATrueHeadingPlugin)
class ULSATrueHeadingPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    let identifier = "ULSATrueHeadingPlugin"
    let jsName = "UlsaTrueHeading"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let locationManager = CLLocationManager()
    private var pendingStartCall: CAPPluginCall?
    private var isUpdating = false
    private var navigationModeEnabled = false
    private var latestHeading: CLHeading?
    private var latestLocation: CLLocation?

    override func load() {
        super.load()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.headingFilter = 1
        updateHeadingOrientation()
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(deviceOrientationDidChange),
            name: UIDevice.orientationDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
        locationManager.stopUpdatingHeading()
        locationManager.stopUpdatingLocation()
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.startUpdates(call)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopUpdates()
            call.resolve(["stopped": true])
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = pendingStartCall else {
            if navigationModeEnabled {
                if manager.authorizationStatus != .authorizedAlways &&
                    manager.authorizationStatus != .authorizedWhenInUse {
                    latestLocation = nil
                }
                notifyNavigationChangedIfNeeded()
            }
            return
        }
        pendingStartCall = nil
        startUpdates(call)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        latestHeading = newHeading
        let trueHeading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : nil
        let headingAccuracy = newHeading.headingAccuracy >= 0 ? newHeading.headingAccuracy : nil
        notifyListeners("headingChanged", data: headingPayload(
            trueHeading: trueHeading,
            headingAccuracy: headingAccuracy,
            available: trueHeading != nil && headingAccuracy != nil
        ))
        notifyNavigationChangedIfNeeded()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }
        latestLocation = location
        notifyNavigationChangedIfNeeded()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let coreLocationError = error as? CLError, coreLocationError.code == .headingFailure {
            latestHeading = nil
            notifyListeners("headingChanged", data: headingPayload(
                trueHeading: nil,
                headingAccuracy: nil,
                available: false
            ))
        } else {
            latestLocation = nil
        }
        notifyNavigationChangedIfNeeded()
    }

    @objc private func deviceOrientationDidChange() {
        updateHeadingOrientation()
    }

    private func startUpdates(_ call: CAPPluginCall) {
        navigationModeEnabled = call.getBool("navigationMode") ?? false
        configureLocationManager()

        guard CLLocationManager.headingAvailable() else {
            call.resolve(headingPayload(trueHeading: nil, headingAccuracy: nil, available: false, authorization: "unsupported"))
            notifyNavigationChangedIfNeeded()
            return
        }

        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            updateHeadingOrientation()
            locationManager.startUpdatingLocation()
            locationManager.startUpdatingHeading()
            isUpdating = true
            call.resolve(headingPayload(trueHeading: nil, headingAccuracy: nil, available: false))
            notifyNavigationChangedIfNeeded()
        case .notDetermined:
            pendingStartCall = call
            locationManager.requestWhenInUseAuthorization()
        case .denied:
            call.resolve(headingPayload(trueHeading: nil, headingAccuracy: nil, available: false, authorization: "denied"))
            notifyNavigationChangedIfNeeded()
        case .restricted:
            call.resolve(headingPayload(trueHeading: nil, headingAccuracy: nil, available: false, authorization: "restricted"))
            notifyNavigationChangedIfNeeded()
        @unknown default:
            call.resolve(headingPayload(trueHeading: nil, headingAccuracy: nil, available: false, authorization: "unsupported"))
            notifyNavigationChangedIfNeeded()
        }
    }

    private func stopUpdates() {
        if let pendingCall = pendingStartCall {
            pendingCall.resolve(headingPayload(
                trueHeading: nil,
                headingAccuracy: nil,
                available: false
            ))
        }
        pendingStartCall = nil
        navigationModeEnabled = false
        latestHeading = nil
        latestLocation = nil
        guard isUpdating else {
            return
        }
        locationManager.stopUpdatingHeading()
        locationManager.stopUpdatingLocation()
        isUpdating = false
    }

    private func configureLocationManager() {
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationManager.activityType = navigationModeEnabled ? .otherNavigation : .other
        locationManager.pausesLocationUpdatesAutomatically = !navigationModeEnabled
    }

    private func updateHeadingOrientation() {
        switch UIDevice.current.orientation {
        case .portraitUpsideDown:
            locationManager.headingOrientation = .portraitUpsideDown
        case .landscapeLeft:
            locationManager.headingOrientation = .landscapeRight
        case .landscapeRight:
            locationManager.headingOrientation = .landscapeLeft
        default:
            locationManager.headingOrientation = .portrait
        }
    }

    private func headingPayload(
        trueHeading: CLLocationDirection?,
        headingAccuracy: CLLocationDirection?,
        available: Bool,
        authorization: String? = nil
    ) -> [String: Any] {
        [
            "trueHeading": trueHeading ?? NSNull(),
            "headingAccuracy": headingAccuracy ?? NSNull(),
            "available": available,
            "authorization": authorization ?? authorizationName(locationManager.authorizationStatus)
        ]
    }

    private func notifyNavigationChangedIfNeeded() {
        guard navigationModeEnabled else {
            return
        }
        notifyListeners("navigationChanged", data: navigationPayload())
    }

    private func navigationPayload() -> [String: Any] {
        let trueHeading = nonnegative(latestHeading?.trueHeading)
        let headingAccuracy = nonnegative(latestHeading?.headingAccuracy)
        let speed = nonnegative(latestLocation?.speed)
        let speedAccuracy = nonnegative(latestLocation?.speedAccuracy)
        let course = nonnegative(latestLocation?.course)
        let courseAccuracy = nonnegative(latestLocation?.courseAccuracy)
        let horizontalAccuracy = nonnegative(latestLocation?.horizontalAccuracy)

        return [
            "trueHeading": trueHeading ?? NSNull(),
            "headingAccuracy": headingAccuracy ?? NSNull(),
            "headingTimestamp": timestampMilliseconds(latestHeading?.timestamp) ?? NSNull(),
            "speed": speed ?? NSNull(),
            "speedAccuracy": speedAccuracy ?? NSNull(),
            "course": course ?? NSNull(),
            "courseAccuracy": courseAccuracy ?? NSNull(),
            "horizontalAccuracy": horizontalAccuracy ?? NSNull(),
            "locationTimestamp": timestampMilliseconds(latestLocation?.timestamp) ?? NSNull(),
            "accuracyAuthorization": accuracyAuthorizationName(locationManager.accuracyAuthorization),
            "authorization": authorizationName(locationManager.authorizationStatus)
        ]
    }

    private func nonnegative(_ value: CLLocationDirection?) -> CLLocationDirection? {
        guard let value, value >= 0, value.isFinite else {
            return nil
        }
        return value
    }

    private func timestampMilliseconds(_ date: Date?) -> Double? {
        guard let date else {
            return nil
        }
        let timestamp = date.timeIntervalSince1970 * 1_000
        return timestamp.isFinite ? timestamp : nil
    }

    private func accuracyAuthorizationName(_ authorization: CLAccuracyAuthorization) -> String {
        switch authorization {
        case .fullAccuracy:
            return "full"
        case .reducedAccuracy:
            return "reduced"
        @unknown default:
            return "unsupported"
        }
    }

    private func authorizationName(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return "authorized"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        case .notDetermined:
            return "notDetermined"
        @unknown default:
            return "unsupported"
        }
    }
}
