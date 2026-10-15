import Capacitor
import Foundation
import UIKit

@objc(ULSALogArchivePlugin)
final class ULSALogArchivePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    let identifier = "ULSALogArchivePlugin"
    let jsName = "UlsaLogArchive"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "begin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "append", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "com.strvsn.ulsaEvoApp.log-export", qos: .utility)
    private var transferId: String?
    private var directory: URL?
    private var source: URL?
    private var handle: FileHandle?
    private var expectedBytes = 0
    private var writtenBytes = 0
    // The existing raw-log cap is 100 MiB; allow ZIP metadata/deflate overhead.
    private let maximumArchiveBytes = 110 * 1024 * 1024
    private var saveCall: CAPPluginCall?
    private var isPresenting = false

    @objc func begin(_ call: CAPPluginCall) {
        guard ProcessInfo.processInfo.isiOSAppOnMac else {
            call.reject("この保存経路はMac専用です", "UNSUPPORTED")
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            guard self.transferId == nil else { call.reject("別のZIPを保存中です", "BUSY"); return }
            guard let filename = call.getString("filename"), filename.hasSuffix(".zip"),
                  filename.count <= 128, !filename.contains("/"), !filename.contains("\\"),
                  let bytes = call.getInt("bytes"), bytes > 0, bytes <= self.maximumArchiveBytes else {
                call.reject("ZIPの名前またはサイズが不正です", "INVALID_ARCHIVE")
                return
            }
            let id = UUID().uuidString
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ulsa-log-export-\(id)", isDirectory: true)
            let source = directory.appendingPathComponent(filename)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                guard FileManager.default.createFile(atPath: source.path, contents: nil) else {
                    throw CocoaError(.fileWriteUnknown)
                }
                self.handle = try FileHandle(forWritingTo: source)
                self.transferId = id
                self.directory = directory
                self.source = source
                self.expectedBytes = bytes
                self.writtenBytes = 0
                call.resolve(["id": id])
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("ZIPの一時保存に失敗しました", "TEMP_FILE_FAILED", error)
            }
        }
    }

    @objc func append(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            guard call.getString("id") == self.transferId, self.transferId != nil, !self.isPresenting,
                  let handle = self.handle,
                  call.getInt("offset") == self.writtenBytes,
                  let base64 = call.getString("base64"), base64.count <= 350_000,
                  let data = Data(base64Encoded: base64), !data.isEmpty, data.count <= 256 * 1024,
                  self.writtenBytes + data.count <= self.expectedBytes else {
                call.reject("ZIPの転送順序またはサイズが不正です", "INVALID_CHUNK")
                return
            }
            do {
                try handle.write(contentsOf: data)
                self.writtenBytes += data.count
                call.resolve(["bytes": self.writtenBytes])
            } catch { call.reject("ZIPの一時保存に失敗しました", "WRITE_FAILED", error) }
        }
    }

    @objc func save(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            guard call.getString("id") == self.transferId, self.transferId != nil, !self.isPresenting,
                  self.writtenBytes == self.expectedBytes, let source = self.source else {
                call.reject("ZIPの転送が完了していません", "INCOMPLETE_ARCHIVE")
                return
            }
            do { try self.handle?.synchronize(); try self.handle?.close(); self.handle = nil }
            catch { call.reject("ZIPの保存準備に失敗しました", "FLUSH_FAILED", error); return }
            self.isPresenting = true
            self.saveCall = call
            DispatchQueue.main.async {
                guard let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else {
                    self.finishSave(error: CocoaError(.userCancelled))
                    return
                }
                let picker = UIDocumentPickerViewController(forExporting: [source], asCopy: true)
                picker.delegate = self
                picker.modalPresentationStyle = .formSheet
                presenter.present(picker, animated: true)
            }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let destination = urls.first else { finishSave(error: CocoaError(.fileWriteUnknown)); return }
        let scoped = destination.startAccessingSecurityScopedResource()
        defer { if scoped { destination.stopAccessingSecurityScopedResource() } }
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: destination.path)
            let bytes = (attributes[.size] as? NSNumber)?.intValue
            guard bytes == expectedBytes else { throw CocoaError(.fileWriteUnknown) }
            finishSave(result: ["saved": true, "filename": destination.lastPathComponent,
                                "path": destination.path, "bytes": expectedBytes])
        } catch { finishSave(error: error) }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishSave(result: ["saved": false])
    }

    private func finishSave(result: [String: Any]? = nil, error: Error? = nil) {
        queue.async { [weak self] in
            guard let self else { return }
            let call = self.saveCall
            self.saveCall = nil
            self.isPresenting = false
            if let error { call?.reject("ZIPの保存先を確認できませんでした", "SAVE_FAILED", error) }
            else { call?.resolve(result ?? ["saved": false]) }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            guard call.getString("id") == self.transferId, !self.isPresenting else { call.resolve(); return }
            try? self.handle?.close()
            self.handle = nil
            if let directory = self.directory { try? FileManager.default.removeItem(at: directory) }
            self.directory = nil
            self.source = nil
            self.transferId = nil
            self.expectedBytes = 0
            self.writtenBytes = 0
            call.resolve()
        }
    }
}
