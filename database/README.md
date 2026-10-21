# MySQL database setup (Windows)

The app stores saved conversions in MySQL while continuing to generate static HTML files in `output/`. It uses the existing Windows MySQL server on `localhost:3306`; do not start a second MySQL service on the same port.

## 1. Create the project `.env` file

Open PowerShell in the project folder:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace the placeholders with the MySQL username and password you created during MySQL installation:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=markdown_converter
```

Save the file in the project root, beside `package.json`. Never put actual credentials in `.env.example`, source code, or GitHub. The root `.gitignore` excludes `.env`.

The backend loads this exact project-root `.env` path, regardless of the terminal's current working directory. `DB_HOST`, `DB_PORT`, and `DB_NAME` default to `localhost`, `3306`, and `markdown_converter`; provide your real `DB_USER` and `DB_PASSWORD`.

## 2. Create the database and table

The repeatable [`schema.sql`](./schema.sql) script uses `CREATE DATABASE IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`. It creates:

- `markdown_converter.conversions`
- An auto-increment primary key
- Conversion name, original Markdown, generated HTML, and creation timestamp

It does not drop tables or delete existing conversion data.

### MySQL Workbench

1. Open MySQL Workbench and connect to the running local MySQL server.
2. Open `database/schema.sql` using **File → Open SQL Script**.
3. Click the lightning-bolt **Execute** button.
4. In **Schemas**, refresh the list and expand `markdown_converter` → **Tables**. Confirm `conversions` exists.

### MySQL command line

If MySQL's `bin` folder is on `PATH`, run from the project root:

```powershell
Get-Content .\database\schema.sql | mysql -h localhost -P 3306 -u your_mysql_username -p
```

Enter the MySQL password at the prompt. If PowerShell says `mysql` is not recognized, use Workbench, or run `mysql.exe` by its full installation path (for example, the `bin\mysql.exe` under your MySQL Server installation).

## 3. Install and start the app

From the project root:

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). To test that both the MySQL connection and the `conversions` table are available, open [http://localhost:3000/api/health/db](http://localhost:3000/api/health/db). A successful response looks like:

```json
{"success":true,"database":"markdown_converter","connected":true}
```

The backend uses the `mysql2/promise` connection pool in `connection.js`. Frontend Save, Load, and Delete actions use `/api/conversions` endpoints and never use `localStorage` as persistence.

## 4. Test conversions through the UI or API

In the UI, enter a conversion name and Markdown, select **Save Conversion**, then use Conversion History **Load** and **Delete** actions. The UI shows a successful save only after MySQL confirms the insert.

PowerShell API examples:

```powershell
$body = @{
  projectName = "Windows MySQL test"
  markdownContent = "# Saved from PowerShell`n`nMySQL history test."
} | ConvertTo-Json
$saved = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/conversions -ContentType "application/json" -Body $body
$saved
Invoke-RestMethod -Uri http://localhost:3000/api/conversions
Invoke-RestMethod -Uri "http://localhost:3000/api/conversions/$($saved.id)"
Invoke-RestMethod -Method Delete -Uri "http://localhost:3000/api/conversions/$($saved.id)"
```

Confirm records directly in Workbench, or with the MySQL CLI:

```sql
USE markdown_converter;
SELECT id, project_name, created_at FROM conversions ORDER BY id DESC;
```

## Troubleshooting

The backend terminal logs the original MySQL driver error code and message. API responses give a safe, actionable summary without returning credentials or internal driver messages.

- **Project `.env` file missing:** create it from `.env.example`; make sure it is in the project root, beside `package.json`.
- **`DB_USER` missing:** set `DB_USER` in `.env`. Do not use a guessed username; enter the account created on your MySQL server.
- **Access denied / `ER_ACCESS_DENIED_ERROR`:** check the username and password in `.env`. The app does not disable MySQL authentication.
- **`ECONNREFUSED`:** confirm the `MySQL80` Windows service is running and that `localhost:3306` is correct. XAMPP's MySQL is not needed.
- **Unknown database / `ER_BAD_DB_ERROR`:** execute `database/schema.sql` in Workbench or the MySQL CLI.
- **Missing table / `ER_NO_SUCH_TABLE`:** execute `database/schema.sql`, then restart the backend and check `/api/health/db`.
- **Changed `.env` but still getting the old error:** stop the Node process with Ctrl+C and run `npm start` again.

Do not send your database password in chat or commit `.env`.
