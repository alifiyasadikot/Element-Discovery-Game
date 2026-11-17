# ⚗️ Element Discovery: Multiplayer Element Discovery and Combination System

DBMS Level 3 mini project. **Next.js** (UI + API routes) · **MySQL** (structured, transactional core) · **MongoDB** (activity logs, live sessions, element lore).

Players start with Fire, Water, Earth and Air, combine elements to discover new ones, earn XP / levels / achievements / challenge rewards, and duel each other in timed **fusion battles**.

---

## 1. Installation & running

You need three things installed and running: **Node.js 18.17+** (runs the app), **MySQL 8** (game data) and **MongoDB 6+** (activity logs and lore are optional, see the note below). Follow the guide for your system: [macOS](#11-macos) or [Windows](#12-windows). Then continue with [project setup](#13-set-up-the-project), which is the same on both.

> **MongoDB is optional at runtime.** If it isn't installed, the game still works; only the profile attempt stats and the admin analytics show "offline". You can also use a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster instead of installing it: paste its connection string into `MONGODB_URI`.

### 1.1 macOS

Use [Homebrew](https://brew.sh). Open **Terminal** and run:

```bash
# 1. Homebrew (skip if `brew --version` works). Afterwards run the "Next steps" lines it prints.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js
brew install node

# 3. MySQL (Homebrew's MySQL starts with NO root password)
brew install mysql
brew services start mysql

# 4. MongoDB (official tap; newer Homebrew asks you to trust a third-party tap first)
brew tap mongodb/brew
brew trust mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Check that everything is up:

```bash
node -v                                        # 18.17 or newer
brew services list                             # mysql + mongodb-community should say "started"
mysql -u root -e "SELECT VERSION();"           # prints a version number
mongosh --eval "db.runCommand({ ping: 1 })"    # prints ok: 1
```

> **Already have MySQL from the mysql.com installer?** `brew services` won't manage it. Start it with
> `sudo /usr/local/mysql/support-files/mysql.server start` (the password asked is your **Mac login** password) and use the MySQL root password you chose when installing it. Forgot that password? Easiest fix: `brew install mysql` instead (above) and make sure the old server is stopped.

### 1.2 Windows

Use **PowerShell** (Start → type "PowerShell"). Installers are fine too; the commands below use `winget`, which ships with Windows 10/11.

**Node.js**

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell, then check: `node -v` (18.17 or newer). Or download the LTS installer from <https://nodejs.org>.

**MySQL**

1. Download **MySQL Installer** (the MSI) from <https://dev.mysql.com/downloads/installer/>.
2. Choose **Server only** (or "Developer Default"), keep the default port **3306**, and when asked, **set a root password and remember it**.
3. Leave "Configure MySQL Server as a Windows Service" ticked and **start at system startup** ticked (service name `MySQL80`).
4. Check it: open PowerShell and run
   ```powershell
   Get-Service MySQL80                         # Status should be Running
   & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "SELECT VERSION();"
   ```
   (Adjust the folder if you installed a different 8.x version. Adding that `bin` folder to your PATH lets you type just `mysql`.)

If the service is stopped, start it from an **Administrator** PowerShell: `net start MySQL80`.

**MongoDB** (optional)

1. Download the **MongoDB Community Server** MSI from <https://www.mongodb.com/try/download/community>.
2. In the installer choose **Complete**, keep **"Install MongoDB as a Service"** ticked (service name `MongoDB`), and keep "MongoDB Compass" if you want a GUI.
3. Check it: `Get-Service MongoDB` should be Running. (To use `mongosh` also install it from <https://www.mongodb.com/try/download/shell>.) If the service is stopped, run `net start MongoDB` in an Administrator PowerShell.

> **`npm : File ... cannot be loaded because running scripts is disabled`?** PowerShell blocks npm's script. Either use **Command Prompt (cmd)** instead of PowerShell, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 1.3 Set up the project

Open a terminal **in the project folder** (it has `package.json` in it). Put the path in quotes if it contains spaces.

| | macOS (Terminal) | Windows (PowerShell) |
|---|---|---|
| Go to the folder | `cd "/path/to/element-discovery-game"` | `cd "C:\path\to\element-discovery-game"` |
| Install dependencies | `npm install` | `npm install` |
| Create your settings file | `cp .env.example .env.local` | `copy .env.example .env.local` |
| Open it to edit | `open -e .env.local` | `notepad .env.local` |

`.env.local` is a file whose name starts with a dot, so Finder hides it (press **Cmd+Shift+.** to show hidden files). On Windows make sure Notepad saves it as `.env.local`, not `.env.local.txt` (File → Save As → "All files").

Edit these values:

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=            # macOS Homebrew: leave empty. Windows / mysql.com installer: your root password
MYSQL_DATABASE=element_game

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=element_game

JWT_SECRET=any-long-random-text
```

No quotes and no spaces around the password.

### 1.4 Create the databases and run

The same on both systems:

```bash
npm run setup      # = npm run db:init (MySQL) + npm run db:mongo (MongoDB)
npm run dev
```

`npm run setup` should print three ✓ lines for the SQL files, a "demo accounts" line, and a "MongoDB ready" line. Then open **http://localhost:3000**.

> `npm run db:init` only runs on an **empty** database (it refuses if game tables already exist, so player data is never wiped by accident). To reset, first run `DROP DATABASE element_game;` in MySQL, then `npm run setup` again. Add `-- --no-demo` to skip the demo accounts. You can also run the SQL by hand `database/01_schema.sql`, `02_programmability.sql`, `03_seed.sql`, in that order, inside an empty database (`mysql -u root -p element_game < database/01_schema.sql`, etc.; on Windows use the MySQL command-line client or MySQL Workbench).

Demo accounts (created by `db:init`):

| Account | Login | Password | Role |
|---|---|---|---|
| Admin | `admin@elements.dev` | `admin123` | Admin |
| Players | `ava@example.com`, `ben@example.com`, `cleo@example.com` | `password123` | Player |

To try a battle: sign in as one player in a normal window and another in a private/incognito window; create a battle in one and join it in the other.

Later runs only need: make sure MySQL and MongoDB are running, then `npm run dev`.

### 1.5 Troubleshooting

**Both systems**

| Problem | Fix |
|---|---|
| `Access denied for user 'root'` | `MYSQL_PASSWORD` in `.env.local` doesn't match the MySQL root password. |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB isn't running (see below). Run `npm run db:mongo` after starting it; the MySQL part of setup already finished. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running or has networking off (see below). |
| `npm audit` warnings | Safe to ignore for a local lab project. Don't run `npm audit fix --force` (it jumps to a new major Next.js version and may break the app). |
| Port 3000 already in use | Stop the other app, or run `npx next dev -p 3001` and open that port instead. |
| Want a clean slate | In MySQL run `DROP DATABASE element_game;`, then `npm run db:init` and `npm run db:mongo` again. |

**macOS**

| Problem | Fix |
|---|---|
| MySQL not running | `brew services start mysql` (Homebrew) or `sudo /usr/local/mysql/support-files/mysql.server start` (mysql.com installer). |
| Still `ECONNREFUSED` on 3306 | Run `mysql -u root -p -e "SHOW VARIABLES WHERE Variable_name IN ('port','skip_networking');"` it must say `port 3306` and `skip_networking OFF`. If `ON`, stop MySQL, make sure no leftover process runs (`ps aux \| grep [m]ysqld`), and start it again. |
| MongoDB not running | `brew services start mongodb-community` |
| `Refusing to load formula … from untrusted tap` | `brew trust mongodb/brew`, then install again. |
| `brew: command not found` | Run the "Next steps" lines the Homebrew installer printed, or open a new Terminal. |
| `sudo` says "Sorry, try again" | That prompt wants your **Mac login** password (nothing shows while typing), not the MySQL one. |

**Windows**

| Problem | Fix |
|---|---|
| MySQL not running | Administrator PowerShell: `net start MySQL80` (check the exact name with `Get-Service *mysql*`). |
| MongoDB not running | Administrator PowerShell: `net start MongoDB` (or `Get-Service *mongo*`). |
| `'mysql' is not recognized` | Use the full path (`& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" ...`) or add its `bin` folder to PATH. The app itself doesn't need it on PATH. |
| `'node' / 'npm' is not recognized` | Close and reopen the terminal after installing Node.js; if it persists, reinstall Node.js and keep "Add to PATH" ticked. |
| `running scripts is disabled` | Use Command Prompt, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `.env.local.txt` created by Notepad | Rename it to `.env.local` (enable View → File name extensions in Explorer), or save with "All files". |
| Forgot the MySQL root password | Re-run MySQL Installer → Reconfigure the server, or use the MySQL documentation's "reset root password" steps; then update `.env.local`. |
| Port 3306 busy | Another MySQL is running. Stop it from Services (`services.msc`) or change `MYSQL_PORT` in `.env.local` to match the one you use. |

---

## 2. Schema changes vs. the first draft

| Change | Why |
|---|---|
| `USER` → `app_user`, `MATCH` → `battle` (`match_id` → `battle_id`) | `USER` / `MATCH` are reserved words in several SQL dialects. A "match" here is a multiplayer battle. |
| `battle_action` is a **weak entity**: PK `(battle_id, action_seq)` | Cannot exist without its battle; `action_seq` is the partial key (1, 2, 3 … per battle). |
| `battle_action (battle_id, user_id)` → composite FK to `battle_player` | The actor must really be a player of *that* battle. |
| `battle_action.recipe_id` / `result_element_id` nullable | A failed attempt has no recipe and no result. |
| `recipe`: `UNIQUE(element1_id, element2_id)` + `CHECK(element1_id <= element2_id)` | A+B and B+A are one recipe. Procedures normalise with `LEAST/GREATEST`. |
| `discovery`: `UNIQUE(user_id, recipe_id)` | A user can discover a recipe once. |
| `battle`: `CHECK(winner_id IS NULL OR status='Completed')`, `winner_id` nullable | No winner while running; NULL on a draw. |

Deliberately denormalised (kept in sync by triggers / procedures, documented for the report): `app_user.level` (from `xp`), `total_wins`, `total_losses`, `discovery.is_first_discovery`, `battle_player.score`.

---

## 3. What lives where

### MySQL: structured, transactional
15 tables (`role, app_user, category, element, element_tag, recipe, user_element, discovery, challenge, user_challenge, achievement, user_achievement, battle, battle_player, battle_action`).

| Object | Purpose |
|---|---|
| `combine_elements(user, e1, e2)` | The core transaction: checks both elements are owned, looks up the recipe order-independently, locks the recipe row, detects duplicate and **world-first** discoveries, inserts `user_element` + `discovery`, awards XP. Rolls back on any error. |
| `create_battle / join_battle / battle_combine / finish_battle` | Battle lifecycle. `battle_combine` checks the clock, scores new recipes only (`xp_reward + 5 × difficulty`), numbers the action (`action_seq`). `finish_battle` picks the winner (score → faster last scoring action → draw), pays XP (+100 winner / +25 loser or draw), updates W/L. |
| `bump_challenge`, `grant_achievements` | Progress challenges / award achievements (called by triggers and `finish_battle`). |
| Triggers | `trg_user_level_ins/upd` (level = 1 + ⌊√(xp/100)⌋), `trg_user_starters` (starter elements = tag `starter`), `trg_after_discovery` (challenges + achievements), `trg_achievement_xp`, `trg_challenge_completed` (XP payouts). |
| Views | `leaderboard_xp_view`, `leaderboard_weekly_view`, `leaderboard_discoveries_view`, `leaderboard_first_view`, `player_statistics_view`, `recent_first_discoveries_view`, `battle_history_view` leaderboards are computed on read with `RANK() OVER`, never stored twice. |

### MongoDB: flexible / high-volume
| Collection | Written by | Used for |
|---|---|---|
| `game_activity` | every combination attempt, login, register, battle event | player attempt / success-rate stats (profile), admin analytics: 24h success rate, most-tried impossible pairs, **suspicious-activity** detection (25+ attempts in one minute) |
| `game_sessions` | battle room polling | live battle presence; TTL index expires stale sessions after 1 h |
| `element_metadata` | `npm run db:mongo`, admin "add element" | lore, aliases, fun facts, tags shown on the element page; text index for lore search |

---

## 4. Features → pages

| Module | Page / API |
|---|---|
| User & authentication | `/login`, `/register`, `/profile` bcrypt hashes, signed HTTP-only JWT cookie, roles Player / Moderator / Admin |
| Elements & combinations | `/play` (combine board), `/collection` (search, category / rarity / ★ filters, completion %), `/element/[id]` (lore, **discovery graph**, "created from / used to create", spoilers hidden as `???`) |
| Discovery system | `POST /api/combine` → `combine_elements` |
| XP & progression | XP bar in nav and `/play`, level-up / achievement / challenge toasts |
| Challenges & achievements | `/challenges` with live progress |
| Fusion battles | `/battles` (lobby), `/battles/[id]` (room: countdown, live scores, action log; polled every 2 s) |
| Leaderboards | `/leaderboard` global XP, weekly, most discoveries, world firsts, battle wins + world-first feed |
| Admin & analytics | `/admin` add / deactivate elements, add recipes (duplicate-safe), change roles (Admin only), SQL insights (subquery, GROUP BY), Mongo analytics |

**Not built (out of scope for this version):** admin CRUD for challenges / achievements / categories (they are managed through SQL), vector / semantic search, and WebSocket push (battles poll instead).

---

## 5. Project layout

```
database/   01_schema.sql · 02_programmability.sql · 03_seed.sql · 04_rbac.sql · 05_alter_demo.sql · 06_mongo_demo.js · 07_dml_queries.sql
scripts/    init-db.mjs (runs the SQL, DELIMITER-aware, + demo data) · seed-mongo.mjs
lib/        db.js (MySQL pool) · mongo.js · auth.js · api.js
app/        pages (App Router) + app/api/* route handlers
components/ Nav, CombineBoard, Icon, AuthForm …
```

## 6. Quick SQL demo for viva

```sql
CALL combine_elements(2, 1, 2);                 -- user 2 combines Fire + Water
SELECT * FROM leaderboard_xp_view;               -- ranking computed on read
SELECT username, xp FROM app_user WHERE xp > (SELECT AVG(xp) FROM app_user);   -- subquery
SELECT * FROM battle_action WHERE battle_id = 1 ORDER BY action_seq;           -- weak entity rows
```

## 7. Role-based access control in the database

The app checks roles in code (`lib/auth.js`, `lib/api.js`): Admin pages and `/api/admin/*` refuse Players. `database/04_rbac.sql` enforces the same roles inside MySQL with `CREATE ROLE`, `GRANT` and `REVOKE`:

| MySQL role | Login user / password | Can | Cannot |
|---|---|---|---|
| `game_admin` | `eg_admin` / `Admin#2026` | Read, write and delete every table; run every procedure | — |
| `game_moderator` | `eg_moderator` / `Moder#2026` | Read everything; add and edit elements, recipes, categories, tags | Delete tags (revoked), touch accounts or battles |
| `game_player` | `eg_player` / `Player#2026` | Read the catalogue and leaderboards; play only through stored procedures; change only the `favorite` column | Read `app_user`, delete or edit tables directly |

Run it once as root after setup, then try the demo statements at the bottom of the file:

```bash
mysql -u root -p -h 127.0.0.1 element_game < database/04_rbac.sql
mysql -u eg_player -p -h 127.0.0.1 element_game      # password Player#2026
```

`database/05_alter_demo.sql` shows the remaining DDL commands (`ALTER TABLE` add / modify / rename / drop column, add / drop constraint, `CREATE`/`DROP INDEX`, `RENAME TABLE`, `TRUNCATE`, `DROP TABLE`). Every change is undone at the end, so it is safe on the live database.

`database/06_mongo_demo.js` is a mongosh script that lists the MongoDB collections and indexes and runs insert, find, text search, update (upsert), aggregation and delete, then removes its demo documents:

```bash
mongosh "mongodb://127.0.0.1:27017/element_game" database/06_mongo_demo.js
```

`database/07_dml_queries.sql` demonstrates DML and queries on the game database. Part A runs INSERT, UPDATE, SAVEPOINT and DELETE inside a transaction and rolls it back, so the game data does not change. Part B runs JOIN, nested, correlated, EXISTS, GROUP BY / HAVING, CTE, recursive CTE, view and function queries:

```bash
mysql -u root -p -h 127.0.0.1 --table element_game < database/07_dml_queries.sql
```
