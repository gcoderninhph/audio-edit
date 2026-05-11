import { buildSubtitleRenderSpec, DEFAULT_SUBTITLE_SETTINGS, wrapSubtitleText } from './subtitleRenderModel'

function toAssColor(hexColor, opacity = 1) {
  const normalizedHex = String(hexColor || '#FFFFFF').replace('#', '')
  const red = normalizedHex.slice(0, 2)
  const green = normalizedHex.slice(2, 4)
  const blue = normalizedHex.slice(4, 6)
  const alpha = Math.max(0, Math.min(255, Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255)))

  return `&H${alpha.toString(16).toUpperCase().padStart(2, '0')}${blue}${green}${red}`
}

function formatAssTime(seconds) {
  const totalCentiseconds = Math.max(0, Math.round(Number(seconds || 0) * 100))
  const hours = Math.floor(totalCentiseconds / 360000)
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000)
  const secs = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

function escapeAssText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N')
}

export function jsonToAss(subtitles, framePreset, fontFamily, subtitleSettings = DEFAULT_SUBTITLE_SETTINGS) {
  const renderSpec = buildSubtitleRenderSpec(framePreset, fontFamily, subtitleSettings)

  const styleLine = [
    'Style: Default',
    renderSpec.fontFamily,
    renderSpec.fontSizePx,
    toAssColor(renderSpec.fontColorHex, 1),
    '&H000000FF',
    '&H00000000',
    toAssColor(renderSpec.backgroundColorHex, renderSpec.backgroundOpacity),
    '1',
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    '3',
    '0',
    '0',
    renderSpec.assAlignment,
    renderSpec.sideMarginPx,
    renderSpec.sideMarginPx,
    renderSpec.verticalAlign === 'middle' ? 0 : renderSpec.bottomMarginPx,
    '1',
  ].join(',')

  const events = subtitles.map((subtitle) => {
    const wrappedText = wrapSubtitleText(subtitle.text, renderSpec)
    return `Dialogue: 0,${formatAssTime(subtitle.start)},${formatAssTime(subtitle.end)},Default,,0,0,0,,${escapeAssText(wrappedText)}`
  })

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${framePreset.width}`,
    `PlayResY: ${framePreset.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    styleLine,
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
    ...events,
    '',
  ].join('\n')
}