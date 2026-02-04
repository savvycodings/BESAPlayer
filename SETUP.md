# Server Setup Instructions

## 1. Create Environment File

Create a `.env` file in the `server` directory with the following variables:

```env
GEMINI_API_KEY=your_gemini_api_key_here
POKEDATA_API_KEY=your_pokedata_api_key_here
```

### Getting API Keys:
- **GEMINI_API_KEY**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **POKEDATA_API_KEY**: Get from [Pokedata.io](https://pokedata.io) (if you have an account)

## 2. Build the Server

Compile TypeScript to JavaScript:

```bash
cd server
npm run build
```

This will compile all TypeScript files (including the new `grade.ts`) to the `dist` folder.

## 3. Start the Server

Run the development server:

```bash
npm run dev
```

This will:
- Watch for TypeScript changes and recompile
- Start the server on port 3050
- Show environment variable status on startup

## 4. Verify Server is Running

You should see:
```
🔑 Environment check:
  GEMINI_API_KEY: AIzaSyCxxx...
  POKEDATA_API_KEY: ✅ SET
Server started on port 3050
```

## Troubleshooting

- **ERR_CONNECTION_REFUSED**: Make sure the server is running on port 3050
- **GEMINI_API_KEY not set**: Check your `.env` file exists and has the correct key
- **Build errors**: Make sure all dependencies are installed (`npm install`)

