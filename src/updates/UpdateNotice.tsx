import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Language } from '../settings'
import { AppIcon } from '../icons/AppIcon'
import { shouldNotifyUpdate } from './update-notification'

const copy = {
  en: { title: 'Updates', check: 'Check for updates', checking: 'Checking for updates…', current: 'FlickVert is up to date.', available: 'A new version is available', notification: (version: string) => `FlickVert ${version} is available. Open FlickVert to update.`, manual: 'For portable builds, download the latest version from GitHub Releases.', install: 'Download and install', downloading: 'Downloading update…', error: 'Could not check or install the update. Try again later.', restart: 'Restart to finish updating' },
  ru: { title: 'Обновления', check: 'Проверить обновления', checking: 'Проверяем обновления…', current: 'Установлена последняя версия FlickVert.', available: 'Доступна новая версия', notification: (version: string) => `Доступна FlickVert ${version}. Откройте приложение, чтобы обновить его.`, manual: 'Для портативной версии скачайте обновление со страницы релизов GitHub.', install: 'Скачать и установить', downloading: 'Скачиваем обновление…', error: 'Не удалось проверить или установить обновление. Попробуйте позже.', restart: 'Перезапустить для завершения' },
  zh: { title: '更新', check: '检查更新', checking: '正在检查更新…', current: 'FlickVert 已是最新版本。', available: '有新版本可用', notification: (version: string) => `FlickVert ${version} 已发布。打开应用以更新。`, manual: '便携版请从 GitHub Releases 下载最新版本。', install: '下载并安装', downloading: '正在下载更新…', error: '无法检查或安装更新，请稍后重试。', restart: '重新启动以完成更新' },
} as const

export default function UpdateNotice({ language }: { language: Language }) {
  const labels = copy[language]
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const [status, setStatus] = useState<'checking' | 'current' | 'available' | 'manual' | 'downloading' | 'restart' | 'error'>('checking')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const update = useRef<Update | null>(null)
  const busy = useRef(false)
  const mounted = useRef(false)

  async function notifyAvailable(version: string) {
    const storageKey = 'flickvert:last-update-notification'
    if (!shouldNotifyUpdate(version, localStorage.getItem(storageKey))) return
    try {
      let granted = await isPermissionGranted()
      if (!granted) granted = await requestPermission() === 'granted'
      if (!granted) return
      sendNotification({ title: 'FlickVert', body: labelsRef.current.notification(version) })
      localStorage.setItem(storageKey, version)
    } catch {}
  }

  async function checkUpdate() {
    if (!isTauri() || busy.current) return
    busy.current = true
    setStatus('checking')
    try {
      const supported = await invoke<boolean>('supports_in_app_updates')
      await update.current?.close()
      update.current = null
      const found = await check(supported ? { timeout: 15000 } : { target: 'windows-x86_64-nsis', timeout: 15000 })
      if (!mounted.current) { await found?.close(); return }
      if (found && !supported) { setVersion(found.version); await found.close(); setStatus('manual'); void notifyAvailable(found.version); return }
      update.current = found
      setVersion(found?.version ?? '')
      setStatus(found ? 'available' : 'current')
      if (found) void notifyAvailable(found.version)
    } catch { if (mounted.current) setStatus('error') }
    finally { busy.current = false }
  }

  useEffect(() => {
    mounted.current = true
    void checkUpdate()
    const timer = window.setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000)
    return () => { mounted.current = false; window.clearInterval(timer); void update.current?.close(); update.current = null }
  }, [])

  async function install() {
    if (!update.current || busy.current) return
    busy.current = true
    setProgress(null)
    let total = 0
    let downloaded = 0
    try {
      setStatus('downloading')
      await update.current.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        if (event.event === 'Progress') { downloaded += event.data.chunkLength; if (total && mounted.current) setProgress(Math.min(100, Math.round(downloaded / total * 100))) }
      })
      if (mounted.current) setStatus('restart')
    }
    catch { if (mounted.current) setStatus('error') }
    finally { busy.current = false }
  }

  const message = status === 'available' ? `${labels.available}: ${version}` : status === 'manual' ? `${labels.available}: ${version}. ${labels.manual}` : status === 'downloading' && progress !== null ? `${labels.downloading} ${progress}%` : labels[status]
  const action = status === 'available'
    ? <button className="primary-button update-button" onClick={() => void install()}><AppIcon name="download"/>{labels.install}</button>
    : status === 'restart'
      ? <button className="primary-button update-button" onClick={() => void relaunch()}><AppIcon name="restart"/>{labels.restart}</button>
      : <button className="secondary-button update-button" disabled={status === 'checking' || status === 'downloading'} onClick={() => void checkUpdate()}><AppIcon name="refresh"/>{labels.check}</button>
  return <details className="update-compact">
    <summary aria-label={`${labels.title}: ${message}`} title={`${labels.title}: ${message}`}><span className="update-icon"><AppIcon name="refresh"/></span><span>{labels.title}</span><i className={`update-indicator update-indicator-${status}`} aria-hidden="true"/></summary>
    <div className="update-compact-panel">
      <div className={`update-state update-state-${status}`} aria-live="polite"><span className="update-state-icon" aria-hidden="true">{status === 'current' ? <AppIcon name="check"/> : status === 'error' ? <AppIcon name="alert"/> : <span/>}</span><span>{message}</span></div>
      {action}
    </div>
  </details>
}
