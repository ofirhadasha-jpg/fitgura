import React, { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native'
import { LinearGradient, BottomNav } from '../components'
import {
  type Screen, type FitEvent, type Platform,
  PLATFORMS, PRESET_EVENTS,
  daysUntil, formatDate, nextEventId,
} from '../types'

export function EventsScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const yr = new Date().getFullYear()
  const mo = (n: number) => String(new Date().getMonth() + n).padStart(2, '0')

  const [events, setEvents] = useState<FitEvent[]>([
    { id: 1, name: 'יום האהבה', emoji: '💝', date: `${yr}-02-14`, platforms: ['Amazon', 'Shein'], color: '#FF6B6B', bgColor: '#FFF0F0' },
    { id: 2, name: 'יום הולדת — מיכל', emoji: '🎂', date: `${yr}-${mo(2)}-18`, platforms: ['AliExpress', 'ZARA'], color: '#2E5BFF', bgColor: '#EEF2FF' },
    { id: 3, name: 'יום נישואין', emoji: '💍', date: `${yr + 1}-12-25`, platforms: ['AliExpress', 'Amazon', 'ASOS'], color: '#FF6B6B', bgColor: '#FFF5F0' },
  ])

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newPlatforms, setNewPlatforms] = useState<string[]>([])
  const [newEmoji, setNewEmoji] = useState('🎉')
  const [newColor, setNewColor] = useState('#2E5BFF')
  const [newBg, setNewBg] = useState('#EEF2FF')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  function toggleNewPlatform(name: string) {
    setNewPlatforms((prev) => {
      if (prev.includes(name)) return prev.filter((p) => p !== name)
      if (prev.length >= 3) return prev
      return [...prev, name]
    })
  }

  function selectPreset(i: number) {
    const p = PRESET_EVENTS[i]
    setSelectedPreset(i)
    setNewName(p.name)
    setNewEmoji(p.emoji)
    setNewColor(p.color)
    setNewBg(p.bgColor)
    if (p.month && p.day) setNewDate(`${new Date().getFullYear()}-${p.month}-${p.day}`)
  }

  function addEvent() {
    if (!newName || !newDate || newPlatforms.length === 0) return
    setEvents((prev) => [
      ...prev,
      { id: nextEventId(), name: newName, emoji: newEmoji, date: newDate, platforms: newPlatforms, color: newColor, bgColor: newBg },
    ])
    setShowAdd(false)
    setNewName(''); setNewDate(''); setNewPlatforms([]); setSelectedPreset(null); setNewEmoji('🎉'); setNewColor('#2E5BFF'); setNewBg('#EEF2FF')
  }

  function removeEvent(id: number) {
    setDeletingId(id)
    setTimeout(() => {
      setEvents((prev) => prev.filter((e) => e.id !== id))
      setDeletingId(null)
    }, 300)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <LinearGradient colors={['#0B1437', '#1A2F7A']} style={evStyles.header}>
        <View style={evStyles.headerOrb1} />
        <View style={evStyles.headerOrb2} />
        <View style={{ position: 'relative', zIndex: 1 }}>
          <View style={evStyles.headerTopRow}>
            <View>
              <Text style={evStyles.headerTitle}>לוח אירועים</Text>
              <Text style={evStyles.headerSub}>תזכורות חכמות לפי זמני משלוח</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAdd(true)} activeOpacity={0.8} style={evStyles.addEventBtn}>
              <Text style={{ fontSize: 16 }}>+</Text>
              <Text style={evStyles.addEventBtnText}>הוסף אירוע</Text>
            </TouchableOpacity>
          </View>
          <View style={evStyles.summaryRow}>
            <View style={evStyles.summaryChip}><Text style={evStyles.summaryChipText}>{events.length} אירועים</Text></View>
            <View style={evStyles.summaryChipUrgent}><Text style={evStyles.summaryChipUrgentText}>{events.filter(e => daysUntil(e.date) <= 14 && daysUntil(e.date) >= 0).length} מתקרבים</Text></View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {sorted.length === 0 && (
          <View style={evStyles.emptyState}>
            <Text style={{ fontSize: 52, marginBottom: 12 }}>🗓️</Text>
            <Text style={evStyles.emptyText}>אין אירועים — לחץ "+ הוסף אירוע"</Text>
          </View>
        )}

        {sorted.map((ev) => {
          const dLeft = daysUntil(ev.date)
          const evPlatforms = ev.platforms.map((n) => PLATFORMS.find((p) => p.name === n)).filter((p): p is Platform => p !== undefined)
          const minOrderBy = evPlatforms.length > 0 ? Math.min(...evPlatforms.map((p) => dLeft - p.daysIL)) : dLeft
          const urgent = dLeft >= 0 && minOrderBy <= 3
          const past = dLeft < 0

          return (
            <View key={ev.id} style={[evStyles.eventCard, { opacity: deletingId === ev.id ? 0 : past ? 0.55 : 1 }]}>
              <View style={[evStyles.eventColorBar, { backgroundColor: past ? '#E2E8F0' : ev.color }]} />
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[evStyles.eventEmojiBox, { backgroundColor: ev.bgColor }]}>
                    <Text style={{ fontSize: 24 }}>{ev.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={evStyles.eventName}>{ev.name}</Text>
                        <Text style={evStyles.eventDate}>{formatDate(ev.date)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeEvent(ev.id)} activeOpacity={0.7}>
                        <Text style={{ color: '#CBD5E1', fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={evStyles.eventBadges}>
                      {past ? (
                        <View style={evStyles.pastBadge}><Text style={evStyles.pastBadgeText}>עבר</Text></View>
                      ) : (
                        <>
                          <View style={[evStyles.daysBadge, { backgroundColor: ev.bgColor, borderColor: ev.color }]}>
                            <Text style={[evStyles.daysBadgeText, { color: ev.color }]}>
                              {dLeft === 0 ? 'היום!' : `${dLeft} ימים`}
                            </Text>
                          </View>
                          {evPlatforms.map((plat) => {
                            const orderBy = dLeft - plat.daysIL
                            const chipBg = orderBy <= 0 ? '#FFF0F0' : orderBy <= 3 ? '#FFFBEB' : '#F0FFF6'
                            const chipBorder = orderBy <= 0 ? '#FECACA' : orderBy <= 3 ? '#FDE68A' : 'rgba(46,213,115,0.3)'
                            const chipColor = orderBy <= 0 ? '#DC2626' : orderBy <= 3 ? '#D97706' : '#15803D'
                            const label = orderBy <= 0
                              ? `⚠️ הזמן עכשיו! — ${plat.name}`
                              : orderBy <= 3
                                ? `הזמן תוך ${orderBy}ד׳ — ${plat.name}`
                                : `${plat.name} — ${orderBy}ד׳`
                            return (
                              <View key={plat.name} style={[evStyles.platformChip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                                <Text style={{ fontSize: 11 }}>{plat.logo}</Text>
                                <Text style={[evStyles.platformChipText, { color: chipColor }]}>{label}</Text>
                              </View>
                            )
                          })}
                        </>
                      )}
                    </View>
                  </View>
                </View>
                {!past && dLeft >= 0 && evPlatforms.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <View style={evStyles.timelineLabels}>
                      <Text style={evStyles.timelineLabel}>היום</Text>
                      <Text style={evStyles.timelineLabel}>הזמנה אחרונה</Text>
                      <Text style={[evStyles.timelineLabel, { color: ev.color, fontWeight: '700' }]}>האירוע 🎯</Text>
                    </View>
                    <View style={evStyles.timelineBar}>
                      <View style={[evStyles.timelineFill, {
                        width: `${Math.min(100, Math.max(0, (1 - minOrderBy / Math.max(dLeft, 1)) * 100))}%`,
                        backgroundColor: minOrderBy <= 0 ? '#FECACA' : minOrderBy <= 3 ? '#FDE68A' : ev.color,
                      }]} />
                    </View>
                  </View>
                )}
              </View>
            </View>
          )
        })}

        <View style={evStyles.tipBox}>
          <Text style={{ fontSize: 20 }}>💡</Text>
          <Text style={evStyles.tipText}>
            Fitgura מחשבת את זמן ההזמנה האחרון לפי ימי המשלוח של הפלטפורמה שבחרת — כך שתמיד תקבל בזמן.
          </Text>
        </View>
      </ScrollView>

      {showAdd && (
        <View style={evStyles.sheetOverlay}>
          <TouchableOpacity onPress={() => setShowAdd(false)} activeOpacity={1} style={evStyles.sheetBackdrop} />
          <View style={evStyles.sheet}>
            <LinearGradient colors={['#2E5BFF', '#1a38c8']} style={evStyles.sheetHeader}>
              <View style={evStyles.sheetHeaderRow}>
                <Text style={evStyles.sheetTitle}>הוסף אירוע חדש</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)} activeOpacity={0.7} style={evStyles.sheetCloseBtn}>
                  <Text style={{ color: '#fff', fontSize: 15 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              <View>
                <Text style={evStyles.presetLabel}>בחר מאירועים מוכנים:</Text>
                <View style={evStyles.presetRow}>
                  {PRESET_EVENTS.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => selectPreset(i)}
                      activeOpacity={0.7}
                      style={[evStyles.presetBtn, { borderColor: selectedPreset === i ? p.color : '#E2E8F0', backgroundColor: selectedPreset === i ? p.bgColor : '#F8FAFC' }]}
                    >
                      <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                      <Text style={[evStyles.presetBtnText, { color: selectedPreset === i ? p.color : '#475569' }]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={evStyles.dividerRow}>
                <View style={evStyles.dividerLine} />
                <Text style={evStyles.dividerText}>או הזן ידנית</Text>
                <View style={evStyles.dividerLine} />
              </View>

              <View>
                <Text style={evStyles.inputLabel}>שם האירוע</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="לדוגמה: יום הולדת — אמא"
                  style={evStyles.textInput}
                />
              </View>

              <View>
                <Text style={evStyles.inputLabel}>תאריך האירוע</Text>
                <TextInput
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="YYYY-MM-DD"
                  style={[evStyles.textInput, { textAlign: 'left' }]}
                />
              </View>

              <View>
                <View style={evStyles.platformHeader}>
                  <Text style={evStyles.inputLabel}>פלטפורמות הזמנה — עד 3</Text>
                  <Text style={[evStyles.platformCount, { color: newPlatforms.length >= 3 ? '#DC2626' : '#94A3B8' }]}>{newPlatforms.length}/3</Text>
                </View>
                <View style={evStyles.platformGrid}>
                  {PLATFORMS.map((p) => {
                    const isSel = newPlatforms.includes(p.name)
                    const disabled = !isSel && newPlatforms.length >= 3
                    return (
                      <TouchableOpacity
                        key={p.name}
                        onPress={() => toggleNewPlatform(p.name)}
                        disabled={disabled}
                        activeOpacity={0.7}
                        style={[evStyles.platformBtn, { borderColor: isSel ? p.color : '#E2E8F0', backgroundColor: isSel ? `${p.color}15` : '#F8FAFC', opacity: disabled ? 0.4 : 1 }]}
                      >
                        <Text style={{ fontSize: 14 }}>{p.logo}</Text>
                        <Text style={[evStyles.platformBtnText, { color: isSel ? p.color : '#475569' }]}>{p.name}</Text>
                        <Text style={{ fontSize: 10, color: isSel ? p.color : '#94A3B8' }}>{p.daysIL}ד׳</Text>
                        {isSel && <Text style={{ fontSize: 10, color: p.color }}>✓</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {newPlatforms.length > 0 && (
                  <Text style={evStyles.platformNote}>
                    תקבל תזכורות לפי זמני משלוח: {newPlatforms.map((n) => { const pl = PLATFORMS.find((p) => p.name === n); return pl ? `${n} (${pl.daysIL}ד׳)` : n }).join(' · ')}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={addEvent}
                disabled={!newName || !newDate || newPlatforms.length === 0}
                activeOpacity={0.8}
                style={[evStyles.addEventConfirmBtn, (!newName || !newDate || newPlatforms.length === 0) && evStyles.addEventConfirmBtnDisabled]}
              >
                <Text style={evStyles.addEventConfirmBtnText}>הוסף ללוח האירועים</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      <BottomNav current="events" onNav={onNav} />
    </View>
  )
}

const evStyles = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 24, paddingBottom: 20, position: 'relative', overflow: 'hidden' },
  headerOrb1: { position: 'absolute', top: -40, left: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(46,91,255,0.12)' },
  headerOrb2: { position: 'absolute', bottom: -30, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,107,107,0.1)' },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  addEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 16 },
  addEventBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  summaryChip: { backgroundColor: 'rgba(46,91,255,0.2)', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12 },
  summaryChipText: { fontSize: 12, fontWeight: '700', color: '#93C5FD', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  summaryChipUrgent: { backgroundColor: 'rgba(255,107,107,0.2)', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12 },
  summaryChipUrgentText: { fontSize: 12, fontWeight: '700', color: '#FCA5A5', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  eventCard: { backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent' },
  eventColorBar: { height: 4 },
  eventEmojiBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eventName: { fontWeight: '700', fontSize: 15, color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  eventDate: { fontSize: 12, color: '#94A3B8', marginTop: 3, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  eventBadges: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pastBadge: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  pastBadgeText: { fontSize: 11, color: '#94A3B8', fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  daysBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1 },
  daysBadgeText: { fontSize: 12, fontWeight: '700' },
  platformChip: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  platformChipText: { fontSize: 11, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  timelineLabel: { fontSize: 10, color: '#94A3B8', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  timelineBar: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  timelineFill: { height: '100%', borderRadius: 3 },
  tipBox: { backgroundColor: '#EEF2FF', borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4 },
  tipText: { fontSize: 12, color: '#4F6EFF', lineHeight: 19, flex: 1, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,20,55,0.55)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', maxHeight: '88%' },
  sheetHeader: { padding: 24, flexShrink: 0 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#fff', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  presetLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  presetBtnText: { fontSize: 12, fontWeight: '600', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#F1F5F9' },
  dividerText: { fontSize: 11, color: '#CBD5E1', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  textInput: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', fontSize: 14, backgroundColor: '#F8FAFC', color: '#1E293B', fontFamily: "'Noto Sans Hebrew', sans-serif" },
  platformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  platformCount: { fontSize: 11, fontWeight: '600' },
  platformGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  platformBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  platformBtnText: { fontSize: 12, fontWeight: '600' },
  platformNote: { fontSize: 11, color: '#64748B', marginTop: 8, fontFamily: "'Noto Sans Hebrew', sans-serif" },
  addEventConfirmBtn: { padding: 16, borderRadius: 18, backgroundColor: '#2E5BFF', alignItems: 'center', marginBottom: 8 },
  addEventConfirmBtnDisabled: { backgroundColor: '#E2E8F0' },
  addEventConfirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: "'Noto Sans Hebrew', sans-serif" },
})
