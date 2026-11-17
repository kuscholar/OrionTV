import AppKit
import Foundation

// A named application gives macOS a stable, user-visible identity for the
// removable-volume consent prompt. Never edit TCC or reuse another app's grant.
final class RefreshDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.global(qos: .utility).async {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let logs = home.appendingPathComponent("Library/OrionTV/daily-build/logs")
            do {
                try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
                let log = logs.appendingPathComponent("launcher.log")
                if !FileManager.default.fileExists(atPath: log.path) {
                    FileManager.default.createFile(atPath: log.path, contents: nil)
                }
                let output = try FileHandle(forWritingTo: log)
                defer { try? output.close() }
                try output.seekToEnd()
                func record(_ text: String) {
                    try? output.write(contentsOf: Data("\(Date()): \(text)\n".utf8))
                }
                let disk = Process()
                disk.executableURL = URL(fileURLWithPath: "/usr/sbin/diskutil")
                disk.arguments = ["info", "-plist", "/Volumes/easystore"]
                let pipe = Pipe()
                disk.standardOutput = pipe
                try disk.run()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                disk.waitUntilExit()
                let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
                guard disk.terminationStatus == 0,
                      info?["VolumeUUID"] as? String == "580CADCD-33F5-4D78-9530-2287615873CA" else {
                    record("Deferred: verified easystore is not mounted")
                    DispatchQueue.main.async { NSApp.terminate(nil) }
                    return
                }
                // This native file operation uses the normal macOS consent flow.
                let builds = URL(fileURLWithPath: "/Volumes/easystore/Builds/OrionTV", isDirectory: true)
                do {
                    try FileManager.default.createDirectory(at: builds, withIntermediateDirectories: true)
                    let probe = builds.appendingPathComponent(".permission-probe-\(UUID().uuidString)")
                    try Data("OrionTV access check".utf8).write(to: probe)
                    try FileManager.default.removeItem(at: probe)
                    record("External build storage access verified")
                } catch {
                    record("Removable-volume access needs macOS authorization: \(error)")
                    DispatchQueue.main.async { NSApp.terminate(nil) }
                    return
                }
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/bin/zsh")
                process.arguments = [home.appendingPathComponent("Library/OrionTV/source/OrionTV/scripts/refresh-orion-tv.sh").path]
                var environment = ProcessInfo.processInfo.environment
                environment["ORIONTV_SCHEDULED"] = "1"
                environment["ORIONTV_FORCE_PROFILE_REFRESH"] = "1"
                process.environment = environment
                process.standardOutput = output
                process.standardError = output
                try process.run()
                process.waitUntilExit()
                record("Refresh runner exit: \(process.terminationStatus)")
            } catch {
                NSLog("OrionTV refresh launcher failed: %@", String(describing: error))
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = RefreshDelegate()
app.delegate = delegate
app.run()
