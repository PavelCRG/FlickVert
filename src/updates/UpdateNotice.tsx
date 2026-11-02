import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Language } from '../settings'

const copy = {
  en: { title: 'Updates', check: 'Check for updates', checking: 'Checking for updates…', current: 'FlickVert is up to date.', available: 'A new version is available', manual: 'For portable builds, download the latest version from GitHub Releases.', install: 'Download and install', downloading: 'Downloading update…', error: 'Could not check or install the update. Try again later.', restart: 'Restart to finish updating' },
  ru: { title: 'Обновления', check: 'Проверить обновления', checking: 'Проверяем обновления…', current: 'Установлена последняя версия FlickVert.', available: 'Доступна новая версия', manual: 'Для портативной версии скачайте обновление со страницы релизов GitHub.', install: 'Скачать и установить', downloading: 'Скачиваем обновление…', error: 'Не удалось проверить или установить обновление. Попробуйте позже.', restart: 'Перезапустить для завершения' },
  zh: { title: '更新', check: '检查更新', checking: '正在检查更新…', current: 'FlickVert 已是最新版本。', available: '有新版本可用', manual: '便携版请从 GitHub Releases 下载最新版本。', install: '下载并安装', downloading: '正在下载更新…', error: '无法检查或安装更新，请稍后重试。', restart: '重新启动以完成更新' },
} as const

export default function UpdateNotice({ language }: { language: Language }) {
  const labels = copy[language]
  const [status, setStatus] = useState<'checking' | 'current' | 'available' | 'manual' | 'downloading' | 'restart' | 'error'>('checking')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const update = useRef<Update | null>(null)
  const busy = useRef(false)
  const mounted = useRef(false)

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
      if (found && !supported) { setVersion(found.version); await found.close(); setStatus('manual'); return }
      update.current = found
      setVersion(found?.version ?? '')
      setStatus(found ? 'available' : 'current')
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

  return <section className="settings-group update-group" aria-labelledby="updates-title">
    <div className="update-heading"><span className="update-heading-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M16 8a6.2 6.2 0 0 0-10.7-3L4 6.5M4 3.5v3h3M4 12a6.2 6.2 0 0 0 10.7 3L16 13.5m0 3v-3h-3"/></svg></span><h2 id="updates-title">{labels.title}</h2></div>
    <div className="update-row">
      <div className={`update-state update-state-${status}`} aria-live="polite">
        <span className="update-state-icon" aria-hidden="true">{status === 'current' ? <svg viewBox="0 0 16 16"><path d="m3.5 8 3 3 6-6"/></svg> : status === 'error' ? <svg viewBox="0 0 16 16"><path d="M8 4v4m0 3h.01"/><circle cx="8" cy="8" r="6"/></svg> : <span/>}</span>
        <span>{status === 'available' ? `${labels.available}: ${version}` : status === 'manual' ? `${labels.available}: ${version}. ${labels.manual}` : status === 'downloading' && progress !== null ? `${labels.downloading} ${progress}%` : labels[status]}</span>
      </div>
      {status === 'available' ? <button className="primary-button update-button" onClick={() => void install()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2"/></svg>{labels.install}</button> : status === 'restart' ? <button className="primary-button update-button" onClick={() => void relaunch()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6V2m0 0H9m4 0-3 3a5 5 0 1 0 1.5 5"/></svg>{labels.restart}</button> : <button className="secondary-button update-button" disabled={status === 'checking' || status === 'downloading'} onClick={() => void checkUpdate()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6a5.2 5.2 0 0 0-8.9-2.3L3 5m0-3v3h3m7 2v3h-3"/></svg>{labels.check}</button>}
    </div>
  </section>
}
