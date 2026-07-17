# ARK Lens controlled peer alpha — tester guide

Thank you for testing ARK Lens v2026.06.019. This alpha is for a small group of trusted testers. The goal is to learn whether setup, capture, ranking explanations, relevance feedback, and capture repair make sense without technical assistance.

## Install and pin

1. Unzip the provided release into a folder you will not move during the test.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Select **Load unpacked** and choose the unzipped folder containing `manifest.json`.
5. Open Chrome’s Extensions menu and pin ARK Lens.
6. The Getting Started page opens after first installation. You can reopen it from the popup at any time.

Do not install an ARK Lens folder received from an untrusted person. The owner should give you the release ZIP and its SHA-256 checksum.

## Your first test

1. Open ARK Lens and select **Getting Started & Alpha Guide**.
2. Confirm Alpha readiness shows an active Lens and at least one enabled source.
3. Select **Customize My Lens**. In Basic mode, enter a few roles you want, related roles, deal-breakers, and preferences. Save the Lens.
4. Open a LinkedIn Jobs or SEEK Jobs page.
5. Open ARK Lens and select **Start Session**. The main white `A` changes from a gray background to a green background while the session is active.
6. Browse several jobs in the same tab. You can also select **Capture Current Job**.
7. Select **View Report**. Open a row and check the full description, score evidence, blockers, and capture quality.
8. Mark a few records **Relevant**, **Not relevant**, or **Unsure**. For Not relevant, choose the closest reason.
9. Change one fit decision and verify that your relevance feedback remains separate.
10. Stop the session. The main icon should change back to its normal gray background.

## If capture is wrong

Open the job page, expand **Fix Capture** in the popup, and select **Check Capture**. If it reports missing fields, preview and download the Help File. Review the preview before sharing it. Do not send raw job-page HTML.

A Repair File from a trusted helper must be previewed and tested on the live page before ARK Lens permits activation. You can undo the last repair if it makes capture worse.

## Send feedback

Open the Alpha Guide and download an **Alpha Test Summary**. It contains aggregate version and count information, not job content. Copy the Feedback Template and describe what you attempted, expected, and observed. Include a screenshot when useful and a Help File only for a capture problem.

Use these impact labels:

- **Blocked:** you could not complete the test.
- **Difficult:** you completed it only with confusion or repeated attempts.
- **Minor:** the workflow worked but something was visibly wrong.
- **Suggestion:** an improvement that did not prevent completion.

Please avoid sharing job descriptions, notes, raw HTML, personal profile data, or anything else you do not want the test owner to receive.
