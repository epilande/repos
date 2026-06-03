<div align="center">
  <h1>Repos 📦</h1>
</div>

<p align="center">
  <strong>An interactive CLI tool for managing multiple git repositories.</strong>
</p>

![demo](https://github.com/user-attachments/assets/00fdfece-06bc-4cb6-a4e1-1086bdc8432c)

## ❓ Why?

Managing hundreds of repositories across an organization is tedious. You constantly need to:

- Check which repos have uncommitted changes
- Pull the latest updates across all projects
- Clone new repos that have been created
- Clean up experimental branches and changes

**`repos`** solves this by providing a CLI to manage all your repositories with a terminal UI, parallel operations, and GitHub integration.

## ✨ Features

- 🎯 **Interactive Mode**: Run `repos` without arguments for a menu-driven TUI experience
- 🔀 **Git-like Commands**: Familiar commands (`fetch`, `pull`, `diff`, `checkout`) work across all repos
- 📊 **Terminal UI**: Progress bars, tables, spinners, and colored output
- ⚡ **Parallel Operations**: Fast updates with configurable concurrency
- 🐙 **GitHub Integration**: Clone repos from any GitHub org (Cloud or Enterprise)
- 🔧 **Smart Defaults**: Detects `gh` CLI config and respects `.gitignore` patterns
- 📁 **Config File Support**: Save your settings in `.reposrc.json`
- 🛠️ **Escape Hatch**: Run any command across repos with `repos exec`

## 📦 Installation

### Homebrew

```sh
brew install epilande/tap/repos
```

### Binary Download

Download the pre-built binary for your platform from [Releases](https://github.com/epilande/repos/releases/latest):

```sh
# macOS Apple Silicon
curl -L https://github.com/epilande/repos/releases/latest/download/repos-macos-arm64 -o repos
chmod +x repos
sudo mv repos /usr/local/bin/
```

### Build from Source

```sh
git clone https://github.com/epilande/repos.git
cd repos
bun install
bun run build
```

### Development Setup

```sh
git clone https://github.com/epilande/repos.git
cd repos
bun install
bun link  # Link globally for development
```

## 🚀 Quick Start

1. Run the setup wizard to configure your GitHub org:

   ```sh
   repos init
   ```

2. Check the status of all repos in your current directory:

   ```sh
   repos status
   ```

3. Pull the latest changes across all repos:

   ```sh
   repos pull
   ```

4. Clone all active repos from your organization:

   ```sh
   repos clone --org my-org
   ```

## 🎮 Usage

### Interactive Mode

Run `repos` without any arguments to launch the interactive menu:

```sh
repos
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `↑↓` / `jk` | Navigate menu |
| `Enter` | Select command |
| `s,f,p,d,c` | Jump to git commands (Status, Fetch, Pull, Diff, Checkout) |
| `o,x,e` | Jump to repo commands (Clone, Clean, Exec) |
| `g,i` | Jump to settings (Config, Init) |
| `q` | Quit |

### Commands

| Command                   | Description                            |
| :------------------------ | :------------------------------------- |
| `repos`                   | Launch interactive menu                |
| `repos init`              | Setup wizard for configuration         |
| `repos status`            | Check status of all repositories       |
| `repos fetch`             | Fetch latest changes from remotes      |
| `repos pull`              | Pull latest changes for all repos      |
| `repos diff`              | Show diffs across all repositories     |
| `repos checkout <branch>` | Switch branches across all repos       |
| `repos clone`             | Clone repos from GitHub org            |
| `repos clean`             | Revert changes in repositories         |
| `repos exec "<command>"`  | Run arbitrary command across all repos |
| `repos config`            | View or modify configuration           |

### Status Command

```sh
repos status                   # Full table output
repos status --fetch           # Fetch from remotes first
repos status --summary         # Just show counts
repos status --quiet           # Only show repos with changes
repos status --filter 'api-*'  # Filter by pattern
```

**Example output:**

```
Repository          Branch         Modified  Staged  Untracked  Sync
──────────────────────────────────────────────────────────────────────
✓ webapp            main           0         0       0          ✓
● api-server        main           2         0       1          ↓32
✓ auth-service      feature/oauth  0         0       0          ↑3
```

### Fetch Command

```sh
repos fetch                   # Fetch all repos
repos fetch --prune           # Remove stale remote-tracking refs
repos fetch --all             # Fetch from all remotes
repos fetch --dry-run         # Preview what would be fetched
repos fetch --filter 'api-*'  # Fetch only matching repos
```

### Pull Command

```sh
repos pull                   # Pull all repos
repos pull --dry-run         # Preview what would be updated
repos pull --quiet           # Minimal output
repos pull --parallel 5      # Limit concurrent operations
repos pull --filter 'api-*'  # Pull only matching repos
```

> [!NOTE]
> Pull uses `git pull --ff-only`, so dirty repos are pulled too as long as the incoming changes do not overlap your modified files. Diverged branches (local commits + remote commits) are reported as errors instead of being silently merged. Repos without an upstream are skipped.

### Clone Command

```sh
repos clone --org my-org           # Clone from organization
repos clone --org my-username      # Clone from user account
repos clone --host github.abc.com  # Clone from GitHub Enterprise
repos clone --days 30              # Only repos active in last 30 days
repos clone --parallel 5           # Limit concurrent clone operations
repos clone --shallow              # Shallow clone (faster)
repos clone --skip-existing        # Only clone new repos; don't pull existing ones
repos clone --dry-run              # Preview what would be cloned
```

> [!NOTE]
> By default, clone pulls repos that already exist locally (and clones the rest). Pass `--skip-existing` to clone only new repos and leave existing ones untouched.

### Diff Command

```sh
repos diff                   # Show diffs (default: 500 lines per repo)
repos diff --max-lines 100   # Limit output to 100 lines per repo
repos diff --max-lines 0     # Show full diff (no limit)
repos diff --stat            # Show diffstat summary
repos diff --quiet           # Only list repos with changes
repos diff --parallel 5      # Limit concurrent operations
repos diff --filter 'api-*'  # Diff only matching repos
```

### Checkout Command

```sh
repos checkout main              # Switch to 'main' branch
repos checkout -b feature/new    # Create and switch to new branch
repos checkout main --force      # Skip repos with uncommitted changes
repos checkout main --parallel 5 # Limit concurrent operations
repos checkout main --filter '*' # Checkout only matching repos
```

> [!NOTE]
> Repos with uncommitted changes are skipped unless `--force` is used.

### Clean Command

```sh
repos clean --dry-run         # Preview what would be cleaned
repos clean                   # Revert tracked file changes
repos clean --all             # Also remove untracked files
repos clean --force           # Skip confirmation prompt
repos clean --filter 'api-*'  # Clean only matching repos
```

> [!WARNING]
> The clean command will revert changes. Always use `--dry-run` first!

### Exec Command

```sh
repos exec "git log -1 --oneline"  # Show last commit in each repo
repos exec "npm install"           # Run npm install in all repos
repos exec "pwd" --quiet           # Only show repos with output
repos exec "make test" --parallel 5  # Run with limited concurrency
repos exec "git branch" --filter 'api-*'  # Run only in matching repos
```

> [!TIP]
> Use `repos exec` as an escape hatch for any command not directly supported.

### Config Command

```sh
repos config                           # List all config values
repos config --list                    # List all config values
repos config --get org                 # Get a specific config value
repos config --set org --value my-org  # Set a config value
repos config --location home           # Use home directory config file
```

## ⚙️ Configuration

Create `.reposrc.json` in your project directory or home folder:

```json
{
  "github": {
    "host": "github.com",
    "apiUrl": "https://api.github.com"
  },
  "org": "my-org",
  "daysThreshold": 90,
  "parallel": 10,
  "timeout": 30000,
  "diffMaxLines": 500
}
```

| Option          | Default                  | Description                           |
| :-------------- | :----------------------- | :------------------------------------ |
| `github.host`   | `github.com`             | GitHub host (for Enterprise)          |
| `github.apiUrl` | `https://api.github.com` | GitHub API URL                        |
| `org`           | -                        | Default organization to clone from    |
| `daysThreshold` | `90`                     | Only clone repos active within N days |
| `parallel`      | `10`                     | Number of concurrent operations       |
| `timeout`       | `30000`                  | Network timeout in milliseconds       |
| `diffMaxLines`  | `500`                    | Max lines per diff (0 for unlimited)  |

<details>
<summary><strong>GitHub Enterprise Configuration</strong></summary>

```json
{
  "github": {
    "host": "github.mycompany.com",
    "apiUrl": "https://github.mycompany.com/api/v3"
  },
  "org": "my-team"
}
```

</details>

### Configuration Priority

1. **CLI flags** (highest) — `--org`, `--parallel`, etc.
2. **Project config** — `.reposrc.json` in current directory
3. **User config** — `~/.reposrc.json`
4. **gh CLI** — Detected from `~/.config/gh/hosts.yml`
5. **Defaults** (lowest)

## 🔐 Authentication

For `repos clone`, authentication is required. The tool checks these sources:

1. **gh CLI** — If you have `gh` installed and authenticated (`gh auth login`)
2. **Environment variables** — `GITHUB_TOKEN` or `GH_TOKEN`
3. **Interactive prompt** — Runs setup wizard if no auth found

## 🔧 Development

```sh
# Install dependencies
bun install

# Run in development
bun run src/index.ts status

# Type check
bun run typecheck

# Build binary
bun run build

# Cross-compile for all platforms
bun run build:all
```

<details>
<summary><strong>Project Structure</strong></summary>

```
repos/
├── src/
│   ├── index.ts       # CLI entry point
│   ├── types.ts       # TypeScript interfaces
│   ├── commands/      # Command implementations
│   ├── components/    # Reusable Ink components
│   └── lib/           # Core logic
├── bin/repos          # Dev wrapper script
└── package.json
```

</details>
