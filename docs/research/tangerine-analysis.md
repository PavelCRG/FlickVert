# Tangerine for Mac: product and interaction notes

Source reviewed: [tangerineformac.com](https://tangerineformac.com/).

## Product shape

Tangerine presents itself as an offline, zero-click file utility. Its main loop is to drag a file, tap Shift, and drop on an operation. The wheel stays close to the pointer and offers operations based on the selected file. The site also documents separate modifier keys for advanced tools and file actions, plus keyboard navigation and Escape to cancel.

The product advertises a much broader catalog than FlickVert currently supports: conversion across images, media, documents, spreadsheets, slides, ebooks, subtitles, and archives, along with editing tools and file-management actions. Those counts and capabilities belong to Tangerine and are not FlickVert features.

## FlickVert direction

- Keep the familiar drag, tap Shift, drop-on-format flow.
- Show only conversions available for the file type and installed local engines.
- Keep processing on-device and preserve FlickVert's unique-output naming; save dropped inputs beside their source.
- Use a compact FV lettermark and native system typography, surfaces, and accent color.
- Keep the current keyboard shortcut as an alternative to the global gesture.

## Current scope and platform note

FlickVert supports image conversion and editing, ZIP creation and extraction, subtitles, and selected file actions. Additional formats and media operations depend on locally installed FFmpeg, Pandoc, LibreOffice, ImageMagick, or Poppler. The quick menu opens each mode directly with its modifier key and remains open when the key is released.

Tangerine also advertises operations that FlickVert does not yet provide, including a floating shelf, AirDrop, target-size compression, collage, media trimming and merging, and visual PDF page organization. Its exact conversion and tool counts should not be presented as FlickVert capabilities. See the [Tangerine tools page](https://www.tangerineformac.com/tools) and [product page](https://www.tangerineformac.com/) for the reference scope.

macOS needs Accessibility/Input Monitoring permission for the global drag observer; without it, use the keyboard shortcut and the regular app window. Speed and drag behavior still need measurement on real Windows and macOS systems.
