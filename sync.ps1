# Script di Automazione Personal Tools Hub
# Esegue Pull, Add, Commit e Push in sicurezza.

Write-Host "--- Sincronizzazione GitHub ---" -ForegroundColor Cyan

# 1. Verifica file sensibili (Sicurezza)
$forbiddenFiles = @(".env", ".env.local", "secrets.json")
foreach ($file in $forbiddenFiles) {
    if (Test-Path $file) {
        $check = git check-ignore $file
        if (-not $check) {
            Write-Host "ATTENZIONE: Il file $file NON è ignorato da git!" -ForegroundColor Red
            Write-Host "Aggiungilo al .gitignore prima di continuare."
            exit
        }
    }
}

# 2. Pull
Write-Host "Recupero modifiche dal server..."
git pull origin main

# 3. Add & Status
git add .
Write-Host "Stato attuale:"
git status --short

# 4. Commit e Push
$commitMsg = Read-Host "Inserisci un messaggio per le modifiche (es. 'Aggiunti nuovi tool')"
if (-not $commitMsg) { $commitMsg = "Aggiornamento automatico tools" }

git commit -m $commitMsg
git push origin main

Write-Host "--- Sincronizzazione Completata ---" -ForegroundColor Green
