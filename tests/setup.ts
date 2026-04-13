import { setForceInteractive } from "../src/lib/tty.js";

// Enable interactive mode in tests so ink-testing-library's useInput works
setForceInteractive(true);
