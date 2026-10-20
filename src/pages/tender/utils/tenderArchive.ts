import { supabase } from '../../../lib/supabase'
import { isMissingEmployeeEventsTableError, isMissingRpcError } from './adminTenderHelpers'

// Состояние общее для панели и листа «Архив»: один раз узнали, что RPC или таблицы событий нет, — больше не дёргаем
let eventsTableAvailable: boolean | null = null
let archiveRpcAvailable: boolean | null = null

export const getEventsTableAvailable = () => eventsTableAvailable

export const setEventsTableAvailable = (value: boolean) => {
  eventsTableAvailable = value
}

// Фолбэк без RPC: меняем флаг архива и пишем событие; если событие не записалось — откатываем флаг
async function setArchivedWithoutRpc(id: number, archived: boolean, note: string) {
  const nowIso = new Date().toISOString()

  const { data: previousState, error: previousStateError } = await supabase
    .from('tender_employees')
    .select('is_archived, archived_at')
    .eq('id', id)
    .single()
  if (previousStateError) throw previousStateError

  const { error: updateError } = await supabase
    .from('tender_employees')
    .update(archived ? { is_archived: true, archived_at: nowIso } : { is_archived: false, archived_at: null })
    .eq('id', id)
  if (updateError) throw updateError

  if (eventsTableAvailable === false) return

  const { error: eventError, status: eventStatus } = await supabase
    .from('tender_employee_events')
    .insert({
      employee_id: id,
      event_type: archived ? 'archive' : 'unarchive',
      event_date: nowIso.slice(0, 10),
      note
    })

  if (eventError) {
    if (isMissingEmployeeEventsTableError(eventError, eventStatus)) {
      eventsTableAvailable = false
      return
    }
    await supabase
      .from('tender_employees')
      .update({
        is_archived: previousState.is_archived,
        archived_at: previousState.archived_at
      })
      .eq('id', id)
    throw eventError
  }

  eventsTableAvailable = true
}

async function runWithRpcFallback(
  rpcName: 'archive_tender_employee' | 'restore_tender_employee',
  rpcArgs: Record<string, unknown>,
  fallback: () => Promise<void>
) {
  if (archiveRpcAvailable === false) {
    await fallback()
    return
  }

  const rpcResponse = await supabase.rpc(rpcName, rpcArgs)
  if (rpcResponse.error || rpcResponse.status === 404) {
    if (isMissingRpcError(rpcResponse.error, rpcResponse.status)) {
      archiveRpcAvailable = false
      await fallback()
      return
    }
    throw rpcResponse.error || new Error(`RPC ${rpcName} failed with status ${rpcResponse.status}`)
  }
  archiveRpcAvailable = true
}

export const archiveTenderEmployee = (id: number, reason: string) => runWithRpcFallback(
  'archive_tender_employee',
  { p_employee_id: id, p_reason: reason },
  () => setArchivedWithoutRpc(id, true, reason)
)

export const restoreTenderEmployee = (id: number) => runWithRpcFallback(
  'restore_tender_employee',
  { p_employee_id: id },
  () => setArchivedWithoutRpc(id, false, 'Возвращён из архива')
)
