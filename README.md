# AI Writing Assistant

A Chrome extension that provides AI-powered writing assistance for various writing modes.

## Features

- **Text Selection Integration**: Select text on any webpage to trigger AI writing assistance
- **Multiple Writing Modes**: 
  - Official Document (公文)
  - Copywriting (文案)
  - Technical Documentation (技术文档)
  - Academic Writing
  - Casual Tone
  - Polish & Refine
- **AI Provider Support**: DeepSeek, Qwen, GLM, OpenAI and Anthropic APIs
- **Context Menu Integration**: Right-click on selected text to access writing modes
- **Preview & Confirm**: Review AI output before replacing original text
- **Custom Writing Modes**: Create your own writing styles with custom prompts
- **History**: View and manage recent rewriting history
- **Token Usage Stats**: Track API usage and estimated costs
- **Batch Processing**: Process multiple text segments at once
- **Dark Mode**: Follows system theme with manual toggle

## Installation

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development Mode

Run with hot reload:
```bash
npm run dev
```

## Configuration

1. Click the extension icon to open settings
2. Select your AI provider (DeepSeek recommended for best value)
3. Enter your API key
4. Choose the model to use
5. Click "Test Connection" to verify
6. Save settings

## Usage

### Method 1: Text Selection
1. Select text on any webpage (minimum 3 characters)
2. A floating menu will appear with writing mode options
3. Click a mode or press number key 1-9 to transform the text
4. Preview the result in side-by-side comparison
5. Click "Confirm" to replace

### Method 2: Keyboard Shortcut
1. Select text
2. Press `Ctrl+Shift+W` (Windows) or `Cmd+Shift+W` (Mac)
3. Use number keys 1-9 to select a mode
4. Press `Esc` to cancel

### Method 3: Context Menu
1. Right-click on selected text
2. Navigate to "AI Writing Assistant"
3. Choose a writing mode

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Fix lint issues
npm run lint:fix

# Production build
npm run build
```

## Project Structure

```
├── src/
│   ├── popup/          # Extension popup UI (React)
│   │   ├── index.tsx   # Entry point
│   │   ├── App.tsx     # Main component
│   │   ├── styles.css  # Popup styles
│   │   └── popup.html  # HTML template
│   ├── content/        # Content scripts
│   │   ├── index.ts    # Entry point + orchestrator
│   │   ├── shadow-dom.ts   # Shadow DOM management
│   │   ├── floating-menu.ts # Floating menu UI
│   │   ├── preview-modal.ts # Preview/confirm modal
│   │   ├── batch-process.ts # Batch processing
│   │   ├── custom-prompt.ts # Custom prompt + slash commands
│   │   ├── toast.ts         # Toast notifications
│   │   └── content.css      # All content styles
│   ├── background/     # Service worker
│   │   └── index.ts    # API calls & context menu
│   └── shared/         # Shared code
│       ├── types.ts    # TypeScript types
│       ├── constants.ts # Constants & prompts
│       └── i18n/       # Internationalization
├── manifest.json       # Extension manifest
├── webpack.config.js   # Webpack configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies
```

## Tech Stack

- TypeScript
- React 18
- Webpack 5
- Chrome Extensions Manifest V3

## License

MIT