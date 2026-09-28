import Capacitor
import Photos
import UIKit
import WebKit

private final class SaveSlideImageToPhotosActivity: UIActivity {
    static let saveActivityType = UIActivity.ActivityType("com.strvsn.ulsaEvoApp.saveSlideImageToPhotos")
    private var image: UIImage?

    override class var activityCategory: UIActivity.Category { .action }
    override var activityType: UIActivity.ActivityType? { Self.saveActivityType }
    override var activityTitle: String? { "写真に保存" }
    override var activityImage: UIImage? { UIImage(systemName: "square.and.arrow.down") }

    override func canPerform(withActivityItems activityItems: [Any]) -> Bool {
        activityItems.contains { $0 is UIImage }
    }

    override func prepare(withActivityItems activityItems: [Any]) {
        image = activityItems.compactMap { $0 as? UIImage }.first
    }

    override func perform() {
        guard let image else {
            activityDidFinish(false)
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async { self?.activityDidFinish(false) }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }, completionHandler: { [weak self] saved, _ in
                DispatchQueue.main.async { self?.activityDidFinish(saved) }
            })
        }
    }
}

@objc(ULSASlideImageSharePlugin)
final class ULSASlideImageSharePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ULSASlideImageSharePlugin"
    let jsName = "UlsaSlideImageShare"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    private var isSharing = false

    @objc func share(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let webView = self.bridge?.webView,
                  let presenter = self.bridge?.viewController else {
                call.reject("画像共有を開始できません", "SHARE_UNAVAILABLE")
                return
            }
            guard !self.isSharing, presenter.presentedViewController == nil else {
                call.reject("画像共有画面を表示中です", "SHARE_BUSY")
                return
            }
            guard let x = call.getDouble("x"), x.isFinite,
                  let y = call.getDouble("y"), y.isFinite,
                  let width = call.getDouble("width"), width.isFinite, width > 0,
                  let height = call.getDouble("height"), height.isFinite, height > 0 else {
                call.reject("画像化する範囲が不正です", "INVALID_RECT")
                return
            }

            let requested = CGRect(
                x: CGFloat(x), y: CGFloat(y),
                width: CGFloat(width), height: CGFloat(height)
            )
            guard webView.bounds.contains(requested), requested.width >= 80, requested.height >= 80 else {
                call.reject("カード全体が画面内に収まる位置で長押ししてください", "RECT_OFFSCREEN")
                return
            }
            let rect = requested

            self.isSharing = true
            let configuration = WKSnapshotConfiguration()
            configuration.rect = rect
            webView.takeSnapshot(with: configuration) { [weak self] image, error in
                guard let self else {
                    call.reject("画像共有を開始できません", "SHARE_UNAVAILABLE")
                    return
                }
                guard let image else {
                    self.isSharing = false
                    call.reject(error?.localizedDescription ?? "画像の作成に失敗しました", "SNAPSHOT_FAILED")
                    return
                }

                let activity = UIActivityViewController(
                    activityItems: [image],
                    applicationActivities: [SaveSlideImageToPhotosActivity()]
                )
                activity.popoverPresentationController?.sourceView = webView
                activity.popoverPresentationController?.sourceRect = rect
                activity.completionWithItemsHandler = { [weak self] selectedActivity, completed, _, shareError in
                    self?.isSharing = false
                    if let shareError {
                        call.reject(shareError.localizedDescription, "SHARE_FAILED")
                    } else if selectedActivity == SaveSlideImageToPhotosActivity.saveActivityType && !completed {
                        call.reject("写真に保存できませんでした。写真の追加権限を確認してください", "PHOTO_SAVE_FAILED")
                    } else {
                        call.resolve(["completed": completed])
                    }
                }
                presenter.present(activity, animated: true)
            }
        }
    }
}
