// macOS-only, offline corpus indexing. Emits match metadata, never player text.
// Usage: swift scripts/ocr-index-local.swift /path/to/IMG_1234.jpeg ...
import Foundation
import Vision
import ImageIO

for path in CommandLine.arguments.dropFirst() {
    autoreleasepool {
        var output: [String: Any] = ["file": URL(fileURLWithPath: path).lastPathComponent]
        do {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = false
            try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([request])
            let lines = (request.results ?? []).compactMap { observation -> (String, CGRect, Float)? in
                guard let text = observation.topCandidates(1).first else { return nil }
                return (text.string, observation.boundingBox, text.confidence)
            }
            let footer = lines.filter { $0.1.minY < 0.05 && $0.1.minX < 0.25 }
            let header = lines.filter { $0.1.minY > 0.78 }.map { $0.0 }.joined(separator: " ")
            let battlePattern = try NSRegularExpression(pattern: "(?<![0-9])[0-9]{18,19}(?![0-9])")
            let candidates = footer.flatMap { line in
                battlePattern.matches(in: line.0, range: NSRange(line.0.startIndex..., in: line.0))
                    .compactMap { Range($0.range, in: line.0).map { String(line.0[$0]) } }
            }
            if Set(candidates).count == 1 { output["battleId"] = candidates.first }
            let durationPattern = try NSRegularExpression(pattern: "(?i)Duration\\s+([0-9]{1,3}:[0-5][0-9])")
            if let match = durationPattern.firstMatch(in: header, range: NSRange(header.startIndex..., in: header)),
               let range = Range(match.range(at: 1), in: header) { output["duration"] = String(header[range]) }
            let lower = header.lowercased()
            if lower.contains("victory") { output["result"] = "win" }
            if lower.contains("defeat") { output["result"] = "loss" }
            output["kind"] = lower.contains("damage") || lower.contains("teamfight") ? "damage" :
                (output["result"] != nil ? "scoreboard" : "unknown")
        } catch {
            output["error"] = "local_recognition_failed"
            output["errorDomain"] = (error as NSError).domain
            output["errorCode"] = (error as NSError).code
        }
        if let data = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) { print(text) }
    }
}
