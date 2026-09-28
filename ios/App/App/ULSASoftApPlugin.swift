import Capacitor
import Foundation
import NetworkExtension

@objc(ULSASoftApPlugin)
class ULSASoftApPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ULSASoftApPlugin"
    let jsName = "UlsaSoftAp"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probeInitialPortal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeConfiguration", returnType: CAPPluginReturnPromise)
    ]

    @objc func connect(_ call: CAPPluginCall) {
        guard #available(iOS 11.0, *) else {
            call.unavailable("NEHotspotConfiguration requires iOS 11 or later.")
            return
        }

        guard let ssid = call.getString("ssid")?.trimmingCharacters(in: .whitespacesAndNewlines), !ssid.isEmpty else {
            resolveInputFailure(call, ssid: "", reason: "invalidSSID", message: "SSID is required.")
            return
        }

        guard ssid.lengthOfBytes(using: .utf8) <= 32 else {
            resolveInputFailure(call, ssid: ssid, reason: "invalidSSID", message: "SSID must be 1..32 UTF-8 bytes.")
            return
        }

        let password = call.getString("password") ?? ""
        let joinOnce = call.getBool("joinOnce") ?? true

        let passwordBytes = password.lengthOfBytes(using: .utf8)
        if !password.isEmpty, passwordBytes < 8 || passwordBytes > 63 {
            resolveInputFailure(
                call,
                ssid: ssid,
                reason: "invalidWPAPassphrase",
                message: "WPA passphrase must be 8..63 UTF-8 bytes."
            )
            return
        }

        let configuration: NEHotspotConfiguration
        if password.isEmpty {
            configuration = NEHotspotConfiguration(ssid: ssid)
        } else {
            configuration = NEHotspotConfiguration(ssid: ssid, passphrase: password, isWEP: false)
        }
        configuration.joinOnce = joinOnce

        let manager = NEHotspotConfigurationManager.shared
        DispatchQueue.main.async {
            manager.apply(configuration) { [weak self] error in
                DispatchQueue.main.async {
                    self?.resolveApplyResult(call, ssid: ssid, error: error)
                }
            }
        }
    }

    @objc func removeConfiguration(_ call: CAPPluginCall) {
        guard #available(iOS 11.0, *) else {
            call.unavailable("NEHotspotConfiguration requires iOS 11 or later.")
            return
        }

        guard let ssid = call.getString("ssid")?.trimmingCharacters(in: .whitespacesAndNewlines), !ssid.isEmpty else {
            call.reject("SSID is required.")
            return
        }

        NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
        call.resolve([
            "ssid": ssid,
            "removed": true
        ])
    }

    @objc func probeInitialPortal(_ call: CAPPluginCall) {
        // The fixed Initial AP has no BLE. Probe only its public return page,
        // never a caller-supplied URL or any firmware/session payload.
        let configuration = URLSessionConfiguration.ephemeral
        configuration.allowsCellularAccess = false
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 4
        configuration.timeoutIntervalForResource = 6
        let session = URLSession(configuration: configuration)
        var request = URLRequest(url: URL(string: "http://192.168.4.1/")!)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 6
        session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            if let error {
                let nsError = error as NSError
                DispatchQueue.main.async {
                    call.resolve([
                        "reachable": false,
                        "reason": "nativeNetworkError",
                        "errorCode": nsError.code
                    ])
                }
                return
            }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let page = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            DispatchQueue.main.async {
                call.resolve([
                    "reachable": statusCode == 200 && page.contains("<title>ULSA EVO App OTA</title>"),
                    "reason": statusCode == 200 ? "portalIdentity" : "unexpectedResponse",
                    "httpStatus": statusCode
                ])
            }
        }.resume()
    }

    @available(iOS 11.0, *)
    private func resolveApplyResult(_ call: CAPPluginCall, ssid: String, error: Error?) {
        guard let error else {
            call.resolve([
                "ssid": ssid,
                "connected": true,
                "alreadyAssociated": false,
                "reason": "connected"
            ])
            return
        }

        let nsError = error as NSError
        if nsError.domain == NEHotspotConfigurationErrorDomain,
           nsError.code == NEHotspotConfigurationError.alreadyAssociated.rawValue {
            call.resolve([
                "ssid": ssid,
                "connected": true,
                "alreadyAssociated": true,
                "reason": "alreadyAssociated",
                "message": error.localizedDescription,
                "errorDomain": nsError.domain,
                "errorCode": nsError.code
            ])
            return
        }

        call.resolve([
            "ssid": ssid,
            "connected": false,
            "alreadyAssociated": false,
            "reason": hotspotReason(from: nsError),
            "message": error.localizedDescription,
            "errorDomain": nsError.domain,
            "errorCode": nsError.code
        ])
    }

    private func resolveInputFailure(
        _ call: CAPPluginCall,
        ssid: String,
        reason: String,
        message: String
    ) {
        call.resolve([
            "ssid": ssid,
            "connected": false,
            "alreadyAssociated": false,
            "reason": reason,
            "message": message,
            "errorDomain": "ULSASoftApInput",
            "errorCode": -1
        ])
    }

    private func hotspotReason(from error: NSError) -> String {
        guard error.domain == NEHotspotConfigurationErrorDomain else {
            return error.domain
        }

        guard let code = NEHotspotConfigurationError(rawValue: error.code) else {
            return "code_\(error.code)"
        }

        if code == .invalid { return "invalid" }
        if code == .invalidSSID { return "invalidSSID" }
        if code == .invalidWPAPassphrase { return "invalidWPAPassphrase" }
        if code == .invalidWEPPassphrase { return "invalidWEPPassphrase" }
        if code == .invalidEAPSettings { return "invalidEAPSettings" }
        if code == .invalidHS20Settings { return "invalidHS20Settings" }
        if code == .invalidHS20DomainName { return "invalidHS20DomainName" }
        if code == .userDenied { return "userDenied" }
        if code == .`internal` { return "internal" }
        if code == .pending { return "pending" }
        if code == .systemConfiguration { return "systemConfiguration" }
        if code == .unknown { return "unknown" }
        if code == .joinOnceNotSupported { return "joinOnceNotSupported" }
        if code == .alreadyAssociated { return "alreadyAssociated" }
        if code == .applicationIsNotInForeground { return "applicationIsNotInForeground" }
        if code == .invalidSSIDPrefix { return "invalidSSIDPrefix" }
        if code == .userUnauthorized { return "userUnauthorized" }
        if code == .systemDenied { return "systemDenied" }

        return "code_\(error.code)"
    }
}
