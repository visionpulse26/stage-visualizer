# NAS Upload Size Limits (32MB+ Files)

If you see **"NAS Upload Failed — Không nhận được file"** when uploading large files (e.g. 32MB video), the NAS server (`upload.php`) is not accepting the file. Common causes:

## 1. PHP limits

On the server hosting `https://visual.tooawake.online/upload.php`, increase these in `php.ini`:

```ini
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 300
```

- `upload_max_filesize`: max size of a single file
- `post_max_size`: must be ≥ file size (all form data)
- `max_execution_time`: seconds the script can run (large uploads need more time)

Restart PHP/web server after changing.

## 2. Web server limits

**Nginx** (if used as reverse proxy):

```nginx
client_max_body_size 64M;
```

**Apache** (if used):

```apache
LimitRequestBody 67108864
```

## 3. Frontend timeout

The app waits up to **8 minutes** for large uploads. On slow connections (e.g. < 1 Mbps), 32MB may take longer; consider using a faster network or compressing files before upload.
