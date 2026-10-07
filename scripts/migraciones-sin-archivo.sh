#!/usr/bin/env bash
#
# Cruza lo que Supabase tiene REGISTRADO como aplicado contra los archivos de
# supabase/migrations/, en las dos direcciones.
#
# POR QUE EXISTE
# Varias sesiones de Claude trabajan en paralelo sobre este repo y aplican
# migraciones con el MCP de Supabase, que las registra en la base pero NO deja
# el archivo en el repo. En dos dias (6 y 7 de octubre de 2026) se acumularon
# 21 migraciones aplicadas sin archivo, y nadie se dio cuenta hasta que se
# cruzaron a mano. El repo deja de describir la base y, si alguien reconstruye
# un entorno desde las migraciones, le falta la mitad.
#
# COMO SE USA
# La lista de registradas se saca con el MCP de Supabase (una sesion no tiene
# credenciales de Postgres en la terminal). ACOTALA al 9 de septiembre de 2026,
# que es cuando el repo empezo a llevar archivos de migracion: antes de esa
# fecha hay 239 registradas que nunca tuvieron archivo y no son el problema.
#
#   select string_agg(name, E'\n' order by version)
#   from supabase_migrations.schema_migrations
#   where version >= '20260909';
#
# y despues:
#
#   ./scripts/migraciones-sin-archivo.sh <<'EOF'
#   nombre_de_migracion_1
#   nombre_de_migracion_2
#   EOF
#
# Tambien acepta un archivo:  ./scripts/migraciones-sin-archivo.sh lista.txt
#
# QUE HACER CON LO QUE REPORTE
# Lo que esta en la base y no en el repo se baja con el SQL exacto que se
# ejecuto --la columna `statements` lo guarda-- y se verifica por md5:
#
#   select md5(array_to_string(statements, E'\n')), array_to_string(statements, E'\n')
#   from supabase_migrations.schema_migrations where version = '...';
#
# No reescribir de memoria: ya paso que un archivo escrito a ojo no coincidiera
# con lo aplicado (le sobraba un cron.schedule y le faltaba una rama entera).

set -euo pipefail

cd "$(dirname "$0")/.."
DIR="supabase/migrations"

if [ ! -d "$DIR" ]; then
  echo "No encuentro $DIR. ¿Estás en el repo de Nospi?" >&2
  exit 1
fi

# La lista de registradas: de un archivo si lo pasan, o de la entrada estandar.
if [ $# -ge 1 ]; then
  REGISTRADAS=$(cat "$1")
elif [ ! -t 0 ]; then
  REGISTRADAS=$(cat)
else
  echo "Faltó la lista de migraciones registradas (por stdin o como archivo)." >&2
  echo "Mirá el comentario de arriba de este script para el SQL que la saca." >&2
  exit 1
fi

# Nombres de los archivos del repo, sin el timestamp ni la extension.
# El timestamp del archivo NO coincide con la `version` registrada --el MCP pone
# la suya al aplicar-- asi que el cruce va por NOMBRE, no por version.
ARCHIVOS=$(ls "$DIR" 2>/dev/null | sed -n 's/^[0-9]\{14\}_\(.*\)\.sql$/\1/p' | sort -u)

faltan=0
echo "── Aplicadas en Supabase pero SIN archivo en el repo ──"
while IFS= read -r nom; do
  nom="$(echo "$nom" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "$nom" ] && continue
  if ! printf '%s\n' "$ARCHIVOS" | grep -qxF "$nom"; then
    echo "  falta   $nom"
    faltan=$((faltan + 1))
  fi
done <<< "$REGISTRADAS"
[ "$faltan" -eq 0 ] && echo "  (ninguna)"

# La direccion contraria importa igual: un archivo que nadie aplico es una
# migracion que el proximo deploy va a correr de sorpresa.
sueltas=0
echo
echo "── En el repo pero NO registradas como aplicadas ──"
while IFS= read -r nom; do
  [ -z "$nom" ] && continue
  if ! printf '%s\n' "$REGISTRADAS" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -qxF "$nom"; then
    echo "  sin aplicar   $nom"
    sueltas=$((sueltas + 1))
  fi
done <<< "$ARCHIVOS"
[ "$sueltas" -eq 0 ] && echo "  (ninguna)"

echo
echo "Resumen: $faltan sin archivo · $sueltas sin aplicar"
echo
echo "Dos falsos positivos conocidos, revisalos antes de actuar:"
echo
echo "  1. Contenido metido en otro archivo. Paso con salas_uso_y_cuarta_sala,"
echo "     que vive dentro de salas_de_videollamada. Buscá con grep lo que esa"
echo "     migración creaba antes de darla por perdida."
echo
echo "  2. El cruce es por NOMBRE, y los nombres se renombran. Varias de las"
echo "     'sin aplicar' son solo eso: el archivo dice hora_exacta_fin_preguntas"
echo "     y la registrada dice hora_exacta_fin_preguntas_v2; o en_vivo_hasta_que"
echo "     _se_cierre contra ..._el_evento. Compará el contenido, no el nombre."

# No se sale con error: esto es informativo y corre al arrancar una sesion.
exit 0
