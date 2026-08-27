#!/bin/bash
# Reduce las fotos de perfil que YA estan subidas.
#
# Las nuevas ya se reducen en la app antes de subirlas (lib/imageCompress.ts),
# pero las 219 que hay ocupan 225 MB porque se subieron casi tal cual salen de
# la camara. La app nunca muestra mas de ~1.200 px, asi que sobra con 1080.
#
# Se reemplaza cada foto EN SU MISMA RUTA, para que las direcciones guardadas
# en la base de datos sigan funcionando sin tocar nada.
#
# Antes de reemplazar nada guarda el original en una carpeta local, asi que
# siempre se puede volver atras.
#
# Uso:
#   bash scripts/comprimir-fotos-perfil.sh            <- prueba en seco
#   bash scripts/comprimir-fotos-perfil.sh --aplicar  <- reemplaza de verdad

set -euo pipefail

REF=wjdiraurfbawotlcndmk
BUCKET=profile-photos
MAX_LADO=1080          # pixeles del lado mas largo
CALIDAD=85             # calidad JPEG
MINIMO_BYTES=300000    # por debajo de esto no vale la pena tocarla

APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1
# Tope opcional de fotos a procesar, para probar con pocas primero.
LIMITE=${2:-0}

TRABAJO="$HOME/nospi-fotos-perfil"
RESPALDO="$TRABAJO/originales"
TMP="$TRABAJO/tmp"
mkdir -p "$RESPALDO" "$TMP"

echo "Obteniendo la llave de acceso…"
# El comando devuelve JSON; se saca la llave de servicio sin imprimirla nunca.
KEY=$(npx --yes supabase projects api-keys --project-ref "$REF" --reveal 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k in d.get('keys', []):
    if k.get('id') == 'service_role':
        print(k['api_key']); break
")

if [ -z "$KEY" ]; then
  echo "No se pudo obtener la llave. Corre primero: npx supabase login"
  exit 1
fi

API="https://$REF.supabase.co/storage/v1"

listar() { # $1 = prefijo
  curl -s -X POST "$API/object/list/$BUCKET" \
    -H "Authorization: Bearer $KEY" -H "apikey: $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\":\"$1\",\"limit\":1000,\"sortBy\":{\"column\":\"name\",\"order\":\"asc\"}}"
}

echo "Listando carpetas…"
CARPETAS=$(listar "" | python3 -c "
import sys, json
for o in json.load(sys.stdin):
    # Las carpetas llegan sin metadata; los archivos si la traen.
    if o.get('id') is None: print(o['name'])
")

TOTAL=0; TOCAR=0; ANTES=0; DESPUES=0; ERRORES=0

for carpeta in $CARPETAS; do
  ARCHIVOS=$(listar "$carpeta/" | python3 -c "
import sys, json
for o in json.load(sys.stdin):
    if o.get('id') is not None:
        print(str((o.get('metadata') or {}).get('size', 0)) + '|' + o['name'])
")
  while IFS='|' read -r size nombre; do
    [ -z "${nombre:-}" ] && continue
    TOTAL=$((TOTAL+1))
    ruta="$carpeta/$nombre"

    if [ "$size" -lt "$MINIMO_BYTES" ]; then continue; fi

    if [ "$LIMITE" -gt 0 ] && [ "$TOCAR" -ge "$LIMITE" ]; then continue; fi
    TOCAR=$((TOCAR+1)); ANTES=$((ANTES+size))

    if [ "$APLICAR" -eq 0 ]; then
      printf "  [seco] %s  %s KB\n" "$ruta" "$((size/1024))"
      continue
    fi

    orig="$TMP/orig.img"; nueva="$TMP/nueva.jpg"
    if ! curl -s -f -o "$orig" "$API/object/$BUCKET/$ruta" \
        -H "Authorization: Bearer $KEY" -H "apikey: $KEY"; then
      echo "  ERROR al descargar $ruta"; ERRORES=$((ERRORES+1)); continue
    fi

    # Copia de seguridad ANTES de tocar nada.
    mkdir -p "$RESPALDO/$carpeta"
    cp "$orig" "$RESPALDO/$ruta"

    # sips viene incluido en macOS: no hay que instalar nada.
    if ! sips -s format jpeg -s formatOptions "$CALIDAD" -Z "$MAX_LADO" \
         "$orig" --out "$nueva" >/dev/null 2>&1; then
      echo "  ERROR al reducir $ruta"; ERRORES=$((ERRORES+1)); continue
    fi

    nuevo_size=$(stat -f%z "$nueva")

    # Si no encoge, se deja la original: no tiene sentido perder calidad.
    if [ "$nuevo_size" -ge "$size" ]; then
      printf "  = %s ya estaba optimizada\n" "$ruta"
      DESPUES=$((DESPUES+size)); continue
    fi

    if curl -s -f -X PUT "$API/object/$BUCKET/$ruta" \
        -H "Authorization: Bearer $KEY" -H "apikey: $KEY" \
        -H "Content-Type: image/jpeg" -H "cache-control: 3600" \
        --data-binary "@$nueva" -o /dev/null; then
      printf "  ✓ %s  %s KB → %s KB\n" "$ruta" "$((size/1024))" "$((nuevo_size/1024))"
      DESPUES=$((DESPUES+nuevo_size))
    else
      echo "  ERROR al subir $ruta"; ERRORES=$((ERRORES+1)); DESPUES=$((DESPUES+size))
    fi
  done <<< "$ARCHIVOS"
done

echo ""
echo "=============================================="
echo " Fotos encontradas:      $TOTAL"
echo " Que vale la pena tocar: $TOCAR"
if [ "$APLICAR" -eq 1 ]; then
  echo " Antes:   $((ANTES/1024/1024)) MB"
  echo " Despues: $((DESPUES/1024/1024)) MB"
  echo " Errores: $ERRORES"
  echo " Originales guardados en: $RESPALDO"
else
  echo " Ocupan ahora: $((ANTES/1024/1024)) MB"
  echo ""
  echo " Esto fue solo una PRUEBA. Nada se modifico."
  echo " Para aplicarlo: bash scripts/comprimir-fotos-perfil.sh --aplicar"
fi
echo "=============================================="
