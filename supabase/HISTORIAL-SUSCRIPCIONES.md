# Historial de cobros de suscripción

Nota para el próximo chat que toque suscripciones. Lo de abajo ya está aplicado en
Supabase (proyecto `wjdiraurfbawotlcndmk`), migraciones del 7 de septiembre de 2026.

## El problema que resuelve

`subscriptions` guarda **una sola fila por usuario y la sobrescribe**. Las tres funciones
que la escriben — `wompi-create-subscription`, `wompi-finalize-subscription` y
`wompi-charge-subscriptions-cron` — usan `upsert(..., { onConflict: 'user_id' })`.

Consecuencias que se descubrieron midiendo, no leyendo el código:

- **Las renovaciones no dejaban rastro.** `last_charge_status`, `last_charge_transaction_id`
  y `next_charge_date` se pisan en cada cobro. Solo quedaba el estado actual.
- **Quien se iba y volvía desaparecía como caso.** Al recomprar, el upsert reescribe la fila
  vieja y resetea `start_date` a hoy. En el admin es idéntico a un suscriptor nuevo.

## La solución: `subscription_charges` + un trigger

Tabla append-only, una fila por cada **desenlace** de cobro. `subscriptions` sigue siendo el
estado actual; esta tabla es la historia.

| Campo | |
|---|---|
| `kind` | `inicial` · `renovacion` · `reingreso` |
| `status` | tal como lo devuelve Wompi: `APPROVED`, `DECLINED`, `ERROR`, `VOIDED` |
| `is_reconstructed` | `true` en las filas sembradas al crear la tabla (deducidas, sin transaction_id real) |

### Por qué un trigger y no código en las edge functions

`trg_registrar_cobro_suscripcion` (AFTER INSERT OR UPDATE sobre `subscriptions`) cubre a las
tres funciones de una vez **y a la cuarta que aparezca**. Meterle código a cada una habría sido
tocar tres veces la lógica que mueve plata, y bastaba con que una futura se olvidara de
registrar para volver a quedar ciego.

Cómo decide el `kind`:

- `start_date` cambió → es una compra nueva. Si esa persona ya tenía cobros aprobados,
  es **reingreso**; si no, **inicial**. (El cron nunca toca `start_date`; solo las funciones
  de compra.)
- Cambió `last_charge_transaction_id` o `last_charge_status` → **renovacion**.
- `last_charge_status = 'PENDING'` → **no se registra**. PENDING no es un desenlace. Cuando la
  transacción se resuelva, el cambio de estado vuelve a disparar el trigger.

### Idempotencia

Índice único sobre `(wompi_transaction_id, status)` con `ON CONFLICT DO NOTHING`. Va por
transacción **más estado**, no solo por transacción, porque `markFailure()` en el cron conserva
el `transaction_id` viejo cuando Wompi no devuelve uno nuevo: si la unicidad fuera solo por
transacción, un rechazo posterior sobre esa misma transacción se perdería.

## Lo que ve el admin

`get_all_subscriptions_for_admin()` devuelve cuatro campos nuevos, agregados **al final** para
no mover nada de lo que ya mostraba: `renewals_count`, `first_subscribed_at`, `is_returning`,
`total_charged`.

## Pendiente, no hecho

Las suscripciones vencidas **se quedan en `status = 'active'` para siempre**. Nadie las cierra
cuando pasa `end_date` con `auto_renew = false`. El acceso sí se corta bien —
`has_active_subscription()` valida `end_date > now()` — pero el contador de "suscriptores
activos" y el MRR del admin quedan inflados. Al 7 de septiembre eran 6 de 31.
