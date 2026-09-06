# Privacy Policy — Speak-to-Questionnaire

_Last updated: 2026-09-06_

Speak-to-Questionnaire is an open-source browser extension that lets users answer web surveys by voice. This policy describes what data the extension handles.

## Summary

**The extension does not collect, transmit, or sell any data to its developers.** There is no developer-owned server, no analytics, and no telemetry.

## What is stored locally

The following settings are stored in the browser's local extension storage (`chrome.storage.local`) on your device only:

- Your chosen LLM/ASR service endpoint (Base URL) and the API key you provide for it
- Voice preferences (read-aloud toggles, language, engine selection)

You can erase all of it at any time by removing the extension or clearing its storage.

## What is transmitted, and where

The extension only sends data to **services you explicitly configure yourself** (BYOK — bring your own key):

- **Microphone audio** is recorded in chunks and sent to the transcription/LLM endpoint you configured, for the sole purpose of converting your speech to text. If you use the browser's built-in recognition, audio is handled by the browser vendor's speech service instead.
- **Survey question text and your dictated answers** may be sent to the LLM endpoint you configured (for option matching and essay polishing).

The project developers have no access to these endpoints, cannot see this traffic, and never receive copies.

## What is never done

- No survey content, audio, or answers are sent to the developers or any developer-operated server
- No analytics, tracking, or telemetry
- No remote code is loaded or executed
- No data is shared with or sold to third parties by the developers

## Third-party services

When you configure an LLM/ASR endpoint, that service processes your audio and text under **its own** privacy policy. Choose services you trust.

## Contact

Open an issue at <https://github.com/Echo-Smith/speak-to-questionnaire/issues>.
