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

The wheel currently covers supported image formats and conversions offered by installed FFmpeg, Pandoc, LibreOffice, and ImageMagick tools. Tangerine-style editing tools, archives, subtitles, AirDrop, and file-management actions are outside this implementation. macOS needs Accessibility/Input Monitoring permission for the global Shift-drag observer; without it, use the keyboard shortcut and the regular app window.
