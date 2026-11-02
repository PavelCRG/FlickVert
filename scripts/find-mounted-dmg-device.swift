import Foundation

let target = CommandLine.arguments[1]
let data = FileHandle.standardInput.readDataToEndOfFile()
let propertyList = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
guard let root = propertyList as? [String: Any], let images = root["images"] as? [[String: Any]] else {
    throw NSError(domain: "FlickVert", code: 1, userInfo: [NSLocalizedDescriptionKey: "hdiutil returned an invalid image list"])
}
for image in images where image["image-path"] as? String == target {
    guard let entities = image["system-entities"] as? [[String: Any]],
          let device = entities.compactMap({ $0["dev-entry"] as? String }).first(where: { $0.range(of: #"^/dev/disk\d+$"#, options: .regularExpression) != nil }) else {
        continue
    }
    print(device)
}
