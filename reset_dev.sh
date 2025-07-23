#!/bin/bash
set -e
ENV_FILE="./.env"

echo "🚀 === MEMULAI PROSES RESET TOTAL (METODE HIBRIDA v4) ==="
echo "Menggunakan konfigurasi dari file: ${ENV_FILE}"

# [PERBAIKAN] Memuat variabel dari .env ke dalam environment shell
if [ -f "$ENV_FILE" ]; then
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
else
    echo "❌ ERROR: File .env tidak ditemukan."
    exit 1
fi

# Memastikan variabel DB_DATABASE ada
if [ -z "${DB_DATABASE}" ]; then
    echo "❌ ERROR: DB_DATABASE tidak ditemukan atau kosong di ${ENV_FILE}."
    exit 1
fi
echo "Database yang akan digunakan: ${DB_DATABASE}"
echo ""

# 1. Menghentikan dan menghapus container & volume
echo "=== [1/5] Menghentikan dan Menghapus Container & Volume Lama... ==="
docker-compose --env-file ${ENV_FILE} down -v
echo "✅ Selesai."
echo ""

# 2. Membuat ulang container database
echo "=== [2/5] Membuat Ulang Container Database... ==="
docker-compose --env-file ${ENV_FILE} up -d db
echo "✅ Selesai."
echo ""

# 3. Menunggu database siap
echo "=== [3/5] Menunggu Database Siap (15 detik)... ==="
sleep 15
echo "✅ Database seharusnya sudah siap."
echo ""

# 4. Menerapkan skema menggunakan skrip baru
echo "=== [4/5] Menerapkan Skema Database ke '${DB_DATABASE}'... ==="
./indexer/src/db/run_schemas.sh
echo "✅ Skema berhasil diterapkan."
echo ""

# 5. Memaksa pengaturan password (sebenarnya sudah ditangani oleh PGPASSWORD di run_schemas.sh, tapi ini sebagai jaminan)
echo "=== [5/5] Memaksa Sinkronisasi Password Secara Manual... ==="
if [ -z "${DB_PASSWORD}" ]; then
    echo "❌ ERROR: DB_PASSWORD tidak ditemukan atau kosong di ${ENV_FILE}."
    exit 1
fi
# Menggunakan variabel yang sudah di-source
docker-compose --env-file ${ENV_FILE} exec -T db psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d postgres -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
echo "✅ Password berhasil diatur/disinkronkan."
echo ""

echo "🎉 --- PROSES RESET SELESAI --- 🎉"