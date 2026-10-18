# Release completion requirements

The user authorizes routine fixes and publication without another permission question.
Do not claim a fix is complete solely because code was edited, unit tests passed,
or a commit was pushed. Do not equate a deployed version with receipt on the user's phone.

For every fix:
1. Record the user's observable acceptance condition in a regression test. Include
   the failing input shape (legacy/restored data and aliases where relevant), not
   just a cleaned synthetic state. Do not commit private uploads or real lyrics.
2. Verify the real operation path: owner action -> publication payload -> member
   receive -> rendered screen. For saved behavior, save and actually reload.
   Verify related screens and preserve lyrics, assignments, notes and original files.
3. Add the browser scenario to tests/settings-rec-browser.cjs so both engines and
   the published site execute it. A script only in /tmp is not a lasting check.
4. Use the Verify and publish workflow. Preflight must pass before Pages deployment.
   Wait for final-check and its exact-revision verified-release.json receipt before
   saying publication and final verification are complete. Keep logs/screenshots
   in workflow artifacts. On failure, fix the failure; do not report completion.
5. Report the verified version and material limits honestly. Desktop WebKit is
   not an actual iPhone. If the phone has not received the version, say that its
   receipt remains unverified. Never ask the user to repeat an already supplied detail.

Release evidence must match the current commit and all required checks. A pending,
failed, skipped or older run is not completion evidence. Changes that cannot be
fully exercised with synthetic data need a scoped private check and an explicit
unverified boundary; they must not be described as fully working end to end.
