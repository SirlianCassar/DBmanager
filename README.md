# DBmanager

DBmanager is a portable Electron desktop application for reviewing and editing a CairmDB decision database.

## Development

Install the dependencies and start the application:

```bash
npm install
npm start
```

The local `cairm-full-database.json` file is required at the project root to run or package the application. It is intentionally excluded from Git and must be supplied locally.

## Build

Build the target platform:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Build artifacts are generated in `dist/`. The Windows release is a portable x64 executable and does not require an installer.

The application includes the supplied database and can open, save, or copy CairmDB JSON files through native system dialogs.
