// 안전표지 관리 기능 초기 데이터 시딩 — signage_master / label_size_rule / label_phrase_template.
// 근거: 강원대 연구실안전관리시스템 제공 자료 「안전표지 및 스티커」 폴더
// (별표6 안전보건표지, 소분용기 경고표지 14종/작성방법 안내).
//
// 사용법: node scripts/seed-safety-signage.mjs [--execute]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnvLocal() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvLocal()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const EXECUTE = process.argv.includes('--execute')

// ── signage_master: 산업안전보건법 시행규칙 [별표6] ──
// GHS 그림문자 코드 → 대응 별표6 표지. 고압가스(GHS04)/수생환경유해성(GHS09)/일반경고(GHS07)는
// 대응 코드가 없어 제외(화면에서 "해당 법령상 출입구 표지 의무 없음"으로 안내).
const SIGNAGE_MASTER = [
  {
    code: '201', name: '인화성물질 경고', ghs_pictogram_codes: ['GHS02'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/201.jpg', priority: 20, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '202', name: '산화성물질 경고', ghs_pictogram_codes: ['GHS03'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/202.jpg', priority: 30, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '203', name: '폭발성물질 경고', ghs_pictogram_codes: ['GHS01'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/203.jpg', priority: 10, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '204', name: '급성독성물질 경고', ghs_pictogram_codes: ['GHS06'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/204.jpg', priority: 15, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '205', name: '부식성물질 경고', ghs_pictogram_codes: ['GHS05'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/205.jpg', priority: 25, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '214', name: '발암성·변이원성·생식독성 등 물질경고', ghs_pictogram_codes: ['GHS08'],
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '해당 물질 취급 작업장 및 출입구',
    shape_desc: '노란 삼각형 · 검은 그림', image_path: '/signage/214.jpg', priority: 12, is_pinned: false, trigger_type: 'ghs_pictogram',
  },
  {
    code: '503', name: '금지대상물질의 취급 실험실 등', ghs_pictogram_codes: null,
    legal_basis: '산업안전보건법 시행규칙 [별표6]', location: '실험실 출입구(최상단 고정)',
    shape_desc: '문구형 안내판', image_path: null, priority: 0, is_pinned: true,
    trigger_type: 'special_management',
  },
]

// ── label_size_rule: 산업안전보건법 시행규칙 제170조 ──
const LABEL_SIZE_RULES = [
  { min_volume_l: null, max_volume_l: 5, spec_text: '용기·포장 상하면적을 제외한 전체 표면적의 5% 이상', sort_order: 1 },
  { min_volume_l: 5, max_volume_l: 50, spec_text: '90㎠ 이상', sort_order: 2 },
  { min_volume_l: 50, max_volume_l: 200, spec_text: '180㎠ 이상', sort_order: 3 },
  { min_volume_l: 200, max_volume_l: 500, spec_text: '300㎠ 이상', sort_order: 4 },
  { min_volume_l: 500, max_volume_l: null, spec_text: '450㎠ 이상', sort_order: 5 },
]

// ── label_phrase_template: 「소분용기 경고표지 스티커 제작 종류(14종)」 원문 그대로 ──
// 유해·위험문구/예방조치문구는 법정 고지문구이므로 원문을 그대로 옮김(의역/재구성 금지).
const LABEL_TEMPLATES = [
  {
    cas_no: '67-56-1', name_ko: '메탄올', name_en: 'Methanol', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼키면 유독함', '피부와 접촉하면 유독함', '눈에 심한 자극을 일으킴', '흡입하면 유독함'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'Toxic if swallowed', 'Toxic in contact with skin', 'Causes serious eye irritation', 'Toxic if inhaled'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '정전기 방지 조치를 취하시오.', '(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Take precautionary measures against static discharge.', 'Do not breathe dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '60-29-7', name_ko: '디에틸 에테르', name_en: 'Diethyl ether', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['극인화성 액체 및 증기', '삼키면 유해함', '졸음 또는 현기증을 일으킬 수 있음'],
    hazard_statements_en: ['Extremely flammable liquid and vapour', 'Harmful if swallowed', 'May cause drowsiness or dizziness'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '정전기 방지 조치를 취하시오.', '(분진·흄·가스·미스트·증기·스프레이)의 흡입을 피하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Take precautionary measures against static discharge.', 'Avoid breathing dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '75-09-2', name_ko: '디클로로메탄', name_en: 'Dichloromethane', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['피부에 자극을 일으킴', '눈에 심한 자극을 일으킴', '졸음 또는 현기증을 일으킬 수 있음', '암을 일으킬 수 있음'],
    hazard_statements_en: ['Causes skin irritation', 'Causes serious eye irritation', 'May cause drowsiness or dizziness', 'May cause cancer'],
    precautionary_statements_ko: ['(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '옥외 또는 환기가 잘 되는 곳에서만 취급하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Do not breathe dust/fume/gas/mist/vapours/spray.', 'Use only outdoors or in a well-ventilated area.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '71-43-2', name_ko: '벤젠', name_en: 'Benzene', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼키면 유해함', '피부, 눈에 자극을 일으킴', '암을 일으킬 수 있음', '태아 또는 생식능력에 손상을 일으킬 것으로 의심됨'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'Harmful if swallowed', 'Causes skin, eye irritation', 'May cause cancer', 'Suspected of damaging fertility or the unborn child'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Do not breathe dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '67-64-1', name_ko: '아세톤', name_en: 'Acetone', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼켜서 기도로 유입되면 유해할 수 있음', '눈에 심한 자극을 일으킴', '졸음 또는 현기증을 일으킬 수 있음'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'May be harmful if swallowed and enters airways', 'Causes serious eye irritation', 'May cause drowsiness or dizziness'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(분진·흄·가스·미스트·증기·스프레이)의 흡입을 피하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Avoid breathing dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '64-17-5', name_ko: '에탄올', name_en: 'Ethanol', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '눈에 심한 자극을 일으킴', '암을 일으킬 수 있음'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'Causes serious eye irritation', 'May cause cancer'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '정전기 방지 조치를 취하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Take precautionary measures against static discharge.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '107-21-1', name_ko: '에틸렌글리콜', name_en: 'Ethylene glycol', signal_word_ko: '경고', signal_word_en: 'Warning',
    hazard_statements_ko: ['피부에 자극을 일으킴', '눈에 심한 자극을 일으킴', '호흡기계 자극을 일으킬 수 있음'],
    hazard_statements_en: ['Causes skin irritation', 'Causes serious eye irritation', 'May cause respiratory irritation'],
    precautionary_statements_ko: ['(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '(분진·흄·가스·미스트·증기·스프레이)의 흡입을 피하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Do not breathe dust/fume/gas/mist/vapours/spray.', 'Avoid breathing dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '67-63-0', name_ko: '이소프로필알코올', name_en: 'Isopropyl alcohol', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼켜서 기도로 유입되면 유해할 수 있음', '눈에 심한 자극을 일으킴', '졸음 또는 현기증을 일으킬 수 있음'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'May be harmful if swallowed and enters airways', 'Causes serious eye irritation', 'May cause drowsiness or dizziness'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(분진·흄·가스·미스트·증기·스프레이)의 흡입을 피하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Avoid breathing dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '141-78-6', name_ko: '초산에틸', name_en: 'Ethyl acetate', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '눈에 심한 자극을 일으킴', '호흡기계 자극을 일으킬 수 있음', '졸음 또는 현기증을 일으킬 수 있음'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'Causes serious eye irritation', 'May cause respiratory irritation', 'May cause drowsiness or dizziness'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '108-88-3', name_ko: '톨루엔', name_en: 'Toluene', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼켜서 기도로 유입되면 치명적일 수 있음', '피부에 자극을 일으킴', '졸음 또는 현기증을 일으킬 수 있음', '태아 또는 생식능력에 손상을 일으킬 것으로 의심됨'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'May be fatal if swallowed and enters airways', 'Causes skin irritation', 'May cause drowsiness or dizziness', 'Suspected of damaging fertility or the unborn child'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '옥외 또는 환기가 잘 되는 곳에서만 취급하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Do not breathe dust/fume/gas/mist/vapours/spray.', 'Use only outdoors or in a well-ventilated area.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '67-66-3', name_ko: '클로로포름', name_en: 'Chloroform', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['삼키면 유해함', '피부에 자극을 일으킴', '눈에 심한 자극을 일으킴', '흡입하면 유해함', '암을 일으킬 것으로 의심됨', '태아 또는 생식능력에 손상을 일으킬 것으로 의심됨'],
    hazard_statements_en: ['Harmful if swallowed', 'Causes skin irritation', 'Causes serious eye irritation', 'Harmful if inhaled', 'Suspected of causing cancer', 'Suspected of damaging fertility or the unborn child'],
    precautionary_statements_ko: ['(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '옥외 또는 환기가 잘 되는 곳에서만 취급하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Do not breathe dust/fume/gas/mist/vapours/spray.', 'Do not eat, drink or smoke when using this product. Use only outdoors or in a well-ventilated area.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '110-54-3', name_ko: '헥산', name_en: 'n-Hexane', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['고인화성 액체 및 증기', '삼켜서 기도로 유입되면 치명적일 수 있음', '졸음 또는 현기증을 일으킬 수 있음', '태아 또는 생식능력에 손상을 일으킬 것으로 의심됨'],
    hazard_statements_en: ['Highly flammable liquid and vapour', 'May be fatal if swallowed and enters airways', 'May cause drowsiness or dizziness', 'Suspected of damaging fertility or the unborn child'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '폭발 방지용 전기·환기·조명·장비를 사용하시오.', '(분진·흄·가스·미스트·증기·스프레이)를(을) 흡입하지 마시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Use explosion-proof electrical/ventilating/lighting/equipment.', 'Do not breathe dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '7722-84-1', name_ko: '과산화수소', name_en: 'Hydrogen Peroxide', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['화재 또는 폭발을 일으킬 수 있음 ; 강산화제', '삼키면 유해함', '피부에 심한 화상과 눈 손상을 일으킴', '호흡기계 자극을 일으킬 수 있음', '암을 일으킬 것으로 의심됨'],
    hazard_statements_en: ['May cause fire or explosion; strong oxidizer', 'Harmful if swallowed', 'Causes severe skin burns and eye damage', 'May cause respiratory irritation', 'Suspected of causing cancer'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 - 금연', '가연성 물질과 혼합되지 않도록 조치하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Take any precaution to avoid mixing with combustibles.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
  {
    cas_no: '50-00-0', name_ko: '포르말린 (포름알데히드수용액)', name_en: 'Formalin (Formaldehyde solution)', signal_word_ko: '위험', signal_word_en: 'Danger',
    hazard_statements_ko: ['인화성 액체', '피부와 접촉하면 유독함', '눈에 심한 손상을 일으킴', '흡입하면 유독함', '유전적인 결함을 일으킬 것으로 의심됨', '암을 일으킬 수 있음'],
    hazard_statements_en: ['Flammable liquid', 'Toxic in contact with skin', 'Causes serious eye damage', 'Toxic if inhaled', 'Suspected of causing genetic defects', 'May cause cancer'],
    precautionary_statements_ko: ['열·스파크·화염·고열로부터 멀리하시오 – 금연', '(분진·흄·가스·미스트·증기·스프레이)의 흡입을 피하시오.', '(보호장갑·보호의·보안경·안면보호구)를(을) 착용하시오.', '흡입하면 신선한 공기가 있는 곳으로 옮기고 호흡하기 쉬운 자세로 안정을 취하시오.', '눈에 묻으면 몇 분간 물로 조심해서 씻으시오.', '용기는 환기가 잘 되는 곳에 단단히 밀폐하여 저장하시오.', '폐기물관리법에 따라 내용물/용기를 폐기하시오.'],
    precautionary_statements_en: ['Keep away from heat/sparks/open flames/hot surfaces. No smoking.', 'Avoid breathing dust/fume/gas/mist/vapours/spray.', 'Wear protective gloves/protective clothing/eye protection/face protection.', 'IF INHALED: Remove victim to fresh air and keep at rest in a position comfortable for breathing.', 'IF IN EYES: Rinse cautiously with water for several minutes.', 'Store in a well-ventilated place. Keep container tightly closed.', 'Dispose of contents/container to "WASTE CONTROL ACT".'],
  },
]

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  console.log(`signage_master ${SIGNAGE_MASTER.length}건, label_size_rule ${LABEL_SIZE_RULES.length}건, label_phrase_template ${LABEL_TEMPLATES.length}건 예정`)
  if (!EXECUTE) { console.log('드라이런 완료. 실제 반영하려면 --execute'); return }

  const { error: e1 } = await supabase.from('signage_master').upsert(SIGNAGE_MASTER, { onConflict: 'code' })
  if (e1) throw e1
  const { error: e2 } = await supabase.from('label_size_rule').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e2) throw e2
  const { error: e3 } = await supabase.from('label_size_rule').insert(LABEL_SIZE_RULES)
  if (e3) throw e3
  const { error: e4 } = await supabase.from('label_phrase_template').upsert(LABEL_TEMPLATES, { onConflict: 'cas_no' })
  if (e4) throw e4
  console.log('완료.')
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
