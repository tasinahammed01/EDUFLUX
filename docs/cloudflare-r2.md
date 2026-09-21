# Cloudflare R2 for submission attachments

EduFlux keeps submission objects private. Browser uploads use short-lived presigned `PUT` URLs; reads use short-lived URLs issued only after the API authorizes the student owner or a teacher in the class. Credentials and object keys remain server-side.

## Configuration

Create a private R2 bucket and an API token scoped only to object read/write for that bucket. Configure the API process with:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PRESIGN_TTL_SECONDS=300
```

Production startup rejects missing or partial R2 configuration. Tests use the in-memory object-storage adapter and never contact R2.

## Browser CORS

Allow `PUT` from the exact web origin and permit the `Content-Type` header. Do not make the bucket public. A typical policy is:

```json
[
  {
    "AllowedOrigins": ["https://your-eduflux-web.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

## Limits and cleanup

The defaults are five files, 15 MiB per file, and 50 MiB total per submission. Allowed types are PDF, JPEG, PNG, and WebP. The API verifies object size and content type with `HEAD` before a file becomes usable.

Schedule `pnpm --filter @eduflux/api storage:cleanup` to remove expired pending uploads. Deleting a draft attachment does not delete an object referenced by immutable attempt history.
