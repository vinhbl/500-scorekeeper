/* Runs as `pretest`, before the suites.
   Without jsdom, scoring.test.js passes and prints "43 passed, 0 failed",
   then the && chain dies silently — so a clean clone reports green while
   two of the three suites never ran. Fail loudly instead. */

try {
  require.resolve("jsdom");
} catch (e) {
  console.error(
    "\n  jsdom is not installed.\n" +
    "  Two of the three suites need it, and without it `npm test` stops\n" +
    "  after the scoring suite while still looking green.\n\n" +
    "  Run:  npm install\n"
  );
  process.exit(1);
}
