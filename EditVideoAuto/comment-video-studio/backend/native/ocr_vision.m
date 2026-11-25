#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "Thiếu đường dẫn ảnh.\n");
      return 2;
    }
    NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:imagePath];
    if (!image) {
      fprintf(stderr, "Không mở được ảnh.\n");
      return 3;
    }
    NSRect rect = NSMakeRect(0, 0, image.size.width, image.size.height);
    CGImageRef cgImage = [image CGImageForProposedRect:&rect context:nil hints:nil];
    if (!cgImage) {
      fprintf(stderr, "Không chuyển được ảnh sang CGImage.\n");
      return 4;
    }

    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;
    request.automaticallyDetectsLanguage = YES;
    NSError *languageError = nil;
    NSArray<NSString *> *supported = [request supportedRecognitionLanguagesAndReturnError:&languageError] ?: @[];
    NSString *vietnamese = nil;
    for (NSString *candidate in supported) {
      if ([candidate hasPrefix:@"vi-"]) { vietnamese = candidate; break; }
    }
    NSString *language = vietnamese ?: ([supported containsObject:@"en-US"] ? @"en-US" : (supported.firstObject ?: @"auto"));
    if (![language isEqualToString:@"auto"]) request.recognitionLanguages = @[language];

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
    NSError *performError = nil;
    if (![handler performRequests:@[request] error:&performError]) {
      fprintf(stderr, "OCR thất bại: %s\n", performError.localizedDescription.UTF8String);
      return 5;
    }
    NSMutableArray *items = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results ?: @[]) {
      VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
      if (!candidate) continue;
      CGRect box = observation.boundingBox;
      [items addObject:@{
        @"text": candidate.string,
        @"confidence": @(candidate.confidence),
        @"x": @(box.origin.x),
        @"y": @(1.0 - box.origin.y - box.size.height),
        @"width": @(box.size.width),
        @"height": @(box.size.height)
      }];
    }
    NSDictionary *payload = @{ @"language": language, @"supportedLanguages": supported, @"observations": items };
    NSError *jsonError = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&jsonError];
    if (!json) {
      fprintf(stderr, "Không tạo được JSON OCR: %s\n", jsonError.localizedDescription.UTF8String);
      return 6;
    }
    fwrite(json.bytes, 1, json.length, stdout);
  }
  return 0;
}
