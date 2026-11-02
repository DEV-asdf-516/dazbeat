# 메인 메뉴 BGM 제작 기록

가제 `Nebula Reverie / 성운의 잔향`. 메뉴 계열 화면(메인, 세팅, 크레딧, 프로필, 에디터 곡 고르기)에서 끊지 않고 이어 반복하는 보컬 없는 인스트루멘털이다. 화면 목록은 `src/game/app/sceneRoutes.ts` 의 `MENU_MUSIC_SCENE_KEYS` 이고, 그 밖의 화면에 들어가면 멈춘다. 세팅에서 마스터나 음악 볼륨을 바꾸면 바로 반영된다.

## 파일

| 경로                                      | 형식                         | 비고                                                                                                                       |
| ----------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `audio-check/main-menu-bgm/main-menu.wav` | PCM 16-bit, 48 kHz, 스테레오 | 원본 마스터. 저장소에 올리지 않는 로컬 파일이다(`audio-check/` 는 git 무시). 생성 음원이 16-bit 라 24-bit 로 늘리지 않았다 |
| `public/assets/audio/bgm/main-menu.ogg`   | Vorbis, 48 kHz, 약 176 kbps  | Phaser 가 먼저 고르는 형식                                                                                                 |
| `public/assets/audio/bgm/main-menu.mp3`   | MP3 CBR 160 kbps, 48 kHz     | ogg 를 재생할 수 없는 브라우저용                                                                                           |

세 파일 모두 ffmpeg 로 디코딩하면 3,880,611 샘플(80.846 초)이다. 앞뒤 무음은 없다.

## 생성

- 도구: ACE-Step 1.5(`ACE-Step/ACE-Step-1.5` 커밋 `ca1e85fe`), 로컬 API 서버(`uv run acestep-api`, macOS MLX 백엔드, Apple M5 / 16 GB)
- 호출: 공식 스킬 `ace-step/ace-step-skills`(커밋 `4cdd152e`)의 `acestep.sh generate`, native 모드, `use_cot_caption=false`(캡션을 LM 이 고쳐 쓰지 않게), `thinking=true`
- 모델: DiT `acestep-v15-turbo`, LM `acestep-5Hz-lm-0.6B`(메모리 기준 자동 선택). 스텝·CFG 는 서버 기본값
- 공통 인자: `-l "[inst]" --duration 100 --bpm 96 --key-scale "F# minor" --time-sig 4`. 32마디를 잘라내고 꼬리를 감을 여유를 두려고 100초로 생성했다

채택한 후보(A-2) 캡션:

> Original instrumental background music loop for a celestial-themed Japanese-inspired rhythm game main menu. Ethereal, dreamy, mysterious yet warmly hopeful, like walking through a quiet observatory beneath a vast nebula. Lead: delicate crystalline glass-bell and music-box motif over wide airy evolving synth pads. Soft electric piano chords, faint shimmering arpeggio, warm rounded sub-bass, extremely restrained heartbeat-like downtempo pulse, light kick, delicate straight hi-hats. Spacious, polished, elegant, intimate, floating, starlit. F-sharp minor with luminous add9, maj7 and sus2 harmonies. One small memorable understated motif with tasteful variations, gentle dynamic arc, no climax. Ethereal electronica, ambient downtempo. Pure instrumental, no vocals, no choir, no humming, no EDM drop, no trailer percussion, no harsh lead, no vinyl noise.

B·C 는 같은 틀에서 주 음색만 바꿨다(B: 플럭 아르페지오 중심, C: 일렉트릭 피아노·그레인 질감 중심).

## 후보 비교 (신호 분석만, 청음 전)

| 후보            | seed           | 실측 템포     | 구성(마디별 음량)                               | 판단                                               |
| --------------- | -------------- | ------------- | ----------------------------------------------- | -------------------------------------------------- |
| A-1 벨·패드     | 1101           | 96.0          | 도입 8마디 −33 dB → 본문 −17 dB, 끝까지 큼      | 루프 경계 음량 차 +13~22 dB                        |
| **A-2 벨·패드** | **1002846357** | **95.0**      | 도입 8 (−35) → 본문 24 (−17) → 마무리 8 (−32)   | **채택.** 조용한 마무리가 조용한 도입으로 이어진다 |
| B 아르페지오    | 2201           | 96.0          | 본문 중간 2마디 −37 dB 로 빠졌다 −14 dB 로 복귀 | 드롭처럼 들릴 수 있는 구성, 경계 차 +10~15 dB      |
| C-1 피아노·질감 | 3301           | 96.0          | 본문 −12 dB, 구간별 큰 기복                     | 밀도·음량이 메뉴 배경으로 큼                       |
| C-2 피아노·질감 | 364495785      | 박자 추적 129 | 본문 −13~−15 dB                                 | 템포 느낌이 다를 수 있고 음량이 큼                 |

목표 96 BPM 과 1% 다르지만, 메뉴 BGM 은 어떤 박자와도 동기화하지 않는다. 타임스트레치(음질 손상)나 리샘플(음정 +18 cent)로 숫자를 맞추지 않고 95 BPM 그대로 두었다.

## 최종 사양

- 95.0 BPM(onset 자기상관: 마디 2.5265 s, 4마디 10.105 s), 4/4, 32마디 = 80.846 s
- 조성: F♯ minor 계열(크로마 상위 F♯·E·A)
- 원곡 10.151 s(4마디 시작)부터 32마디를 잘랐다. 끝점은 시작 뒤 5 초와 끝 뒤 5 초의 onset·mel 상관이 가장 큰 위치로 맞추고 파형 상관으로 샘플 단위까지 다듬었다
- tail wrapping: 끝점 뒤에 이어지던 원곡 한 마디(2.526 s)를 루프 첫 마디에 equal-power crossfade 했다. 그래서 루프 마지막 샘플 다음에는 원곡에서 실제로 이어지던 샘플이 온다
- 레벨: −18.0 LUFS(integrated), sample peak −2.42 dBFS, true peak 약 −2.1 dBTP(4배 오버샘플 추정), 클리핑 0
- 게임 안 gain: `masterVolume × musicVolume × 1.2`(실제 약 −16.4 LUFS, sample peak 약 −0.8 dBFS). `effectVolume` 은 쓰지 않는다

## 변환

```sh
# 마스터와 ogg: Python soundfile(libsndfile). 로컬 ffmpeg 에 libvorbis 가 없어서다.
sf.write('main-menu.wav', loop, 48000, subtype='PCM_16')
sf.write('main-menu.ogg', loop, 48000, format='OGG', subtype='VORBIS', compression_level=0.45)
# mp3: LAME 헤더에 encoder delay/padding 이 남아 디코더가 잘라낼 수 있다
ffmpeg -i audio-check/main-menu-bgm/main-menu.wav -c:a libmp3lame -b:a 160k public/assets/audio/bgm/main-menu.mp3
```

Chrome 은 이 ogg 를 285 샘플 더 길게 디코딩한다(Vorbis 끝 패딩을 자르지 않음). 그래서 `src/game/ui/view/MenuMusic.ts` 가 반복 구간을 `MENU_MUSIC_LOOP_MS = 80_846` marker 로 정한다. 음원을 바꾸면 이 값도 새 루프 길이로 고친다.

## 권리

- ACE-Step 1.5 코드: MIT(저장소 `LICENSE`)
- 모델 가중치: Hugging Face `ACE-Step/Ace-Step1.5`, `ACE-Step/acestep-5Hz-lm-0.6B` 모두 `license: mit`. 모델 카드에 생성 음악을 상업적으로 써도 된다는 문구와, 학습 데이터가 라이선스 음원·로열티 프리·합성 데이터라는 설명이 있다
- 확인하지 못한 것: AI 생성 음원의 저작권 보호 여부는 나라마다 다르다. 기존 곡과의 유사성은 자동으로 검사하지 않았고 청음 확인도 하지 않았다

## 검증

확인함:

- 세 파일 모두 재생 가능하고 디코딩 길이가 같다. 클리핑과 앞뒤 무음이 없다
- 3회 연속 이어 붙인 두 경계: 최대 샘플 변화 0.006(본문 99.9 백분위 0.185), mel 변화 5.9~7.1(본문 99 백분위 10.5). 경계 앞뒤 1 초 음량은 −40 → −35 dB 로, 본문(−18 dB)보다 17 dB 이상 작은 조용한 구간이다
- Chromium(Playwright 1.58), 로컬 dev 서버:
  - 메인에서 반복 예약이 `start(when, 0, 80.846)` 이다
  - gain 은 기본 설정에서 1.2, `musicVolume=0` 에서 0 이다
  - 선곡 화면으로 가면 BGM 소스가 0개가 되고, 메인 재진입(2회)마다 소리 하나만 생긴다
  - 메인 → 세팅 → 메인 → 크레딧 → 메인 동안 같은 소스가 이어지고(새로 시작하지 않음), 세팅에서 마스터 볼륨을 0.1 내리면 gain 이 즉시 1.08 이 된다. 프로필과 에디터 곡 고르기는 로그인이 필요해 확인하지 않았다
  - 음원 요청 실패: `Failed to load menu music` 경고, 디코딩 실패: Phaser 오류 로그. 두 경우 모두 BGM 없이 선곡 화면으로 정상 진입한다
- `npm run check` 통과

확인하지 못함:

- 청음: 루프 경계 3회 반복의 끊김·박자, 보컬·허밍 유무, 음색과 분위기. 사람이 들어 봐야 한다
- 실제 브라우저의 자동재생 잠금(headless Chromium 은 시작부터 컨텍스트가 running 이었다)과 창 전환
- Safari·Firefox 의 코덱 선택과 mp3 gapless 디코딩. 디코더가 mp3 앞에 패딩을 남기면 marker 길이 때문에 루프 끝 몇십 ms 가 잘린다(경계는 조용한 구간이다)
