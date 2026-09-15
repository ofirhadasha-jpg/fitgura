import React, { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native'
import { BottomNav } from '../components'
import {
  type Screen, type FitEvent, type Platform,
  PLATFORMS, PRESET_EVENTS,
  daysUntil, formatDate, nextEventId,
} from '../types'

export function EventsScreen({ onNav, isAdmin }: { onNav: (s: Screen) => void; isAdmin?: boolean }) {
  const yr = new Date().getFullYear()
  const mo = (n: number) => String(new Date().getMonth() + n).padStart(2, '0')

  const [events, setEvents] = useState<FitEvent[]>([
    { id: 1, name: 'יום האהבה', emoji: '💝', date: `${yr}-02-14`, platforms: ['Amazon', 'Shein'], color: '#FF6B6B', bgColor: '#FFF0F0' },
    { id: 2, name: 'יום הולדת — מיכל', emoji: '🎂', date: `${yr}-${mo(2)}-18`, platforms: ['AliExpress', 'ZARA'], color: '#FFE566', bgColor: '#FFFACC' },
    { id: 3, name: 'יום נישואין', emoji: '💍', date: `${yr + 1}-12-25`, platforms: ['AliExpress', 'Amazon', 'ASOS'], color: '#FF6B6B', bgColor: '#FFF5F0' },
  ])

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newPlatforms, setNewPlatforms] = useState<string[]>([])
  const [newEmoji, setNewEmoji] = useState('🎉')
  const [newColor, setNewColor] = useState('#FFE566')
  const [newBg, setNewBg] = useState('#FFFACC')
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
    setNewName(''); setNewDate(''); setNewPlatforms([]); setSelectedPreset(null); setNewEmoji('🎉'); setNewColor('#FFE566'); setNewBg('#FFFACC')
  }

  function removeEvent(id: number) {
    setDeletingId(id)
    setTimeout(() => {
      setEvents((prev) => prev.filter((e) => e.id !== id))
      setDeletingId(null)
    }, 300)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F0E0' }}>
      <View style={evStyles.header}>
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
      </View>

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
              <View style={[evStyles.eventColorBar, { backgroundColor: past ? '#9A9A9A' : ev.color }]} />
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
                        <Text style={{ color: '#9A9A9A', fontSize: 16 }}>✕</Text>
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
                            const chipBg = orderBy <= 0 ? '#FFF0F0' : orderBy <= 3 ? '#FFFACC' : '#E0FFF0'
                            const chipBorder = orderBy <= 0 ? '#1A1A1A' : orderBy <= 3 ? '#1A1A1A' : '#1A1A1A'
                            const chipColor = orderBy <= 0 ? '#DC2626' : orderBy <= 3 ? '#1A1A1A' : '#00CC52'
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
                      <Text style={[evStyles.timelineLabel, { color: '#1A1A1A', fontWeight: '700' }]}>האירוע 🎯</Text>
                    </View>
                    <View style={evStyles.timelineBar}>
                      <View style={[evStyles.timelineFill, {
                        width: `${Math.min(100, Math.max(0, (1 - minOrderBy / Math.max(dLeft, 1)) * 100))}%`,
                        backgroundColor: minOrderBy <= 0 ? '#FF6B6B' : minOrderBy <= 3 ? '#FFE566' : '#00FF66',
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
            <View style={evStyles.sheetHeader}>
              <View style={evStyles.sheetHeaderRow}>
                <Text style={evStyles.sheetTitle}>הוסף אירוע חדש</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)} activeOpacity={0.7} style={evStyles.sheetCloseBtn}>
                  <Text style={{ color: '#1A1A1A', fontSize: 15 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              <View>
                <Text style={evStyles.presetLabel}>בחר מאירועים מוכנים:</Text>
                <View style={evStyles.presetRow}>
                  {PRESET_EVENTS.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => selectPreset(i)}
                      activeOpacity={0.7}
                      style={[evStyles.presetBtn, { borderColor: selectedPreset === i ? '#1A1A1A' : '#9A9A9A', backgroundColor: selectedPreset === i ? p.bgColor : '#FFFEF5' }]}
                    >
                      <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                      <Text style={[evStyles.presetBtnText, { color: selectedPreset === i ? '#1A1A1A' : '#4A4A4A' }]}>{p.name}</Text>
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
                  <Text style={[evStyles.platformCount, { color: newPlatforms.length >= 3 ? '#DC2626' : '#9A9A9A' }]}>{newPlatforms.length}/3</Text>
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
                        style={[evStyles.platformBtn, { borderColor: isSel ? '#1A1A1A' : '#9A9A9A', backgroundColor: isSel ? '#FFFACC' : '#FFFEF5', opacity: disabled ? 0.4 : 1 }]}
                      >
                        <Text style={{ fontSize: 14 }}>{p.logo}</Text>
                        <Text style={[evStyles.platformBtnText, { color: isSel ? '#1A1A1A' : '#4A4A4A' }]}>{p.name}</Text>
                        <Text style={{ fontSize: 10, color: isSel ? '#1A1A1A' : '#9A9A9A' }}>{p.daysIL}ד׳</Text>
                        {isSel && <Text style={{ fontSize: 10, color: '#00CC52' }}>✓</Text>}
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

      <BottomNav current="events" onNav={onNav} isAdmin={isAdmin} />
    </View>
  )
}

const evStyles = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 24, paddingBottom: 20, position: 'relative', overflow: 'hidden',
    backgroundColor: '#FFE566',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,0,0,0.04) 27px, rgba(0,0,0,0.04) 28px)',
    borderBottomWidth: 2, borderBottomColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  headerOrb1: { position: 'absolute', top: -40, left: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(26,26,26,0.06)' },
  headerOrb2: { position: 'absolute', bottom: -30, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,107,107,0.12)' },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 26, fontWeight: '400', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  headerSub: { fontSize: 15, color: '#2D2D2D', marginTop: 4, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  addEventBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A1A1A', borderWidth: 2, borderColor: '#1A1A1A',
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    paddingVertical: 9, paddingHorizontal: 16,
    boxShadow: '2px 2px 0 #1A1A1A',
  } as React.CSSProperties,
  addEventBtnText: { color: '#FFE566', fontWeight: '700', fontSize: 14, fontFamily: "'Permanent Marker', cursive" },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  summaryChip: {
    backgroundColor: '#FFFEF5', borderWidth: 1.5, borderColor: '#1A1A1A',
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    paddingVertical: 5, paddingHorizontal: 12,
    boxShadow: '2px 2px 0 #1A1A1A',
  } as React.CSSProperties,
  summaryChipText: { fontSize: 13, fontWeight: '400', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  summaryChipUrgent: {
    backgroundColor: '#E0FFF0', borderWidth: 1.5, borderColor: '#1A1A1A',
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    paddingVertical: 5, paddingHorizontal: 12,
    boxShadow: '2px 2px 0 #00CC52',
  } as React.CSSProperties,
  summaryChipUrgentText: { fontSize: 13, fontWeight: '400', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", fontSize: 16 },
  eventCard: {
    backgroundColor: '#FFFEF5',
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  eventColorBar: { height: 6, borderBottomWidth: 1.5, borderBottomColor: '#1A1A1A' },
  eventEmojiBox: {
    width: 48, height: 48,
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#1A1A1A',
  } as React.CSSProperties,
  eventName: { fontWeight: '700', fontSize: 17, color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  eventDate: { fontSize: 13, color: '#4A4A4A', marginTop: 3, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  eventBadges: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pastBadge: {
    backgroundColor: '#F5F0E0', borderWidth: 1.5, borderColor: '#9A9A9A',
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    paddingVertical: 4, paddingHorizontal: 10,
  } as React.CSSProperties,
  pastBadgeText: { fontSize: 12, color: '#6B6B6B', fontWeight: '400', fontFamily: "'Permanent Marker', cursive" },
  daysBadge: {
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1.5, borderColor: '#1A1A1A',
  } as React.CSSProperties,
  daysBadgeText: { fontSize: 13, fontWeight: '400', fontFamily: "'Permanent Marker', cursive" },
  platformChip: {
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1.5, borderColor: '#1A1A1A',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  backgroundColor: '#FFFEF5',
  } as React.CSSProperties,
  platformChipText: { fontSize: 12, fontWeight: '400', fontFamily: "'Permanent Marker', cursive" },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  timelineLabel: { fontSize: 12, color: '#4A4A4A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  timelineBar: {
    height: 8, backgroundColor: '#F5F0E0',
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    overflow: 'hidden', borderWidth: 1.5, borderColor: '#1A1A1A',
  } as React.CSSProperties,
  timelineFill: { height: '100%', borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px' } as React.CSSProperties,
  tipBox: {
    backgroundColor: '#FFFACC', borderWidth: 1.5, borderColor: '#1A1A1A',
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4,
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  tipText: { fontSize: 14, color: '#1A1A1A', lineHeight: 20, flex: 1, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.55)' },
  sheet: {
    backgroundColor: '#FFFEF5',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    overflow: 'hidden', maxHeight: '88%',
    borderWidth: 2, borderColor: '#1A1A1A',
    borderBottomWidth: 0,
  },
  sheetHeader: {
    padding: 24, flexShrink: 0,
    backgroundColor: '#FFE566',
    borderBottomWidth: 2, borderBottomColor: '#1A1A1A',
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '400', color: '#1A1A1A', fontFamily: "'Permanent Marker', cursive" },
  sheetCloseBtn: {
    width: 32, height: 32,
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px',
    backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#1A1A1A',
  } as React.CSSProperties,
  presetLabel: { fontSize: 15, fontWeight: '700', color: '#2D2D2D', marginBottom: 10, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5,
  } as React.CSSProperties,
  presetBtnText: { fontSize: 13, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1.5, backgroundColor: '#9A9A9A' },
  dividerText: { fontSize: 13, color: '#6B6B6B', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#2D2D2D', marginBottom: 6, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  textInput: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    borderWidth: 1.5, borderColor: '#1A1A1A', fontSize: 15,
    backgroundColor: '#FFFEF5', color: '#1A1A1A',
    fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive",
  } as React.CSSProperties,
  platformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  platformCount: { fontSize: 13, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" },
  platformGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  platformBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: '2px 8px 3px 7px / 6px 2px 7px 3px', borderWidth: 1.5,
  } as React.CSSProperties,
  platformBtnText: { fontSize: 13, fontWeight: '600', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  platformNote: { fontSize: 13, color: '#4A4A4A', marginTop: 8, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  addEventConfirmBtn: {
    padding: 16,
    borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px',
    backgroundColor: '#00FF66', alignItems: 'center', marginBottom: 8,
    borderWidth: 2, borderColor: '#1A1A1A',
    boxShadow: '3px 3px 0 #1A1A1A',
  } as React.CSSProperties,
  addEventConfirmBtnDisabled: { backgroundColor: '#F5F0E0', boxShadow: 'none' } as React.CSSProperties,
  addEventConfirmBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '400', fontFamily: "'Permanent Marker', cursive" },
})
