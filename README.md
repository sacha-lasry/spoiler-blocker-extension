# Spoiler Blocker Extension

A Chrome extension designed to block spoilers on various websites. This extension helps users avoid unwanted information about movies, TV shows, sports events, and more by blurring content that matches user-defined keywords.

## Features

- Block spoilers based on user-defined keywords in natural language
- Apply a blurry effect to hide potential spoilers
- Hover over blocked content to see which keywords triggered the block
- Click on blurred content to temporarily reveal it
- Toggle the extension on/off with a simple switch
- Works across various websites including YouTube, Twitter, and Reddit
- Special site-specific handling for popular platforms

## Installation

### From Source Code (Developer Mode)

1. Clone or download this repository to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click on "Load unpacked" and select the directory containing the extension files
5. The extension should now be installed and visible in your extensions list

### Icon Setup
For a complete setup, replace the placeholder icon files in the `icons` folder with actual icon images in the following sizes:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

## Usage

1. Click on the extension icon in your browser toolbar to open the popup
2. Toggle the extension on or off using the switch at the top
3. Add keywords for topics you want to avoid spoilers for (e.g., "Game of Thrones", "Super Bowl", "One Piece")
4. Click "Save Settings" to apply your changes
5. Browse the web with spoiler protection
6. When content is blocked, hover over it to see which keywords triggered the block
7. Click on blocked content to temporarily reveal it

## How It Works

The extension scans web pages for text that matches your specified keywords. When a match is found, it applies a blur effect to the containing element. The extension uses:

- Content scripts to analyze and modify web pages
- MutationObserver to detect dynamically loaded content
- Site-specific optimizations for popular platforms like YouTube, Twitter, and Reddit
- Local storage to save your settings and keywords

## Customization

You can modify the blur intensity and other visual aspects by editing the `content.css` file.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT