// scripts/parseArgs.js
// Reads "--name value" pairs from the command line into an object.
// Example: ['--email', 'a@b.com', '--password', 'x'] -> { email: 'a@b.com', password: 'x' }
// Shared by createAdmin.js and setPassword.js.

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++; // skip the value we just read
    }
  }
  return args;
}

module.exports = parseArgs;
