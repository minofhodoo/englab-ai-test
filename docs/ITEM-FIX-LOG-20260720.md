# 문항 수정 이력 — 2026-07-20

실무팀 제공 갱신본 `englab_items_NEW_20260720.json` 기준.  
비교 스크립트: `scripts/compare-new-items.js` / 적용 스크립트: `scripts/apply-item-fixes-20260720.js`  
검증: `scripts/validate-items.js` (240문항 520검사 PASS)

---

## A. NEW 그대로 반영 (25건)

| # | 세트 | 번호 | 필드 | 이전값 | 변경값 | 사유 |
|---|------|------|------|--------|--------|------|
| 1 | Challenger-1-6 | 28 | writing.ans | How many crabs are there? | How many books are there? | crabs → books 오탈자 교정 |
| 2 | Challenger-1-6 | 28 | writing.chunks | many/are/How/there/**crabs** | many/are/How/there/**books** | 정답문장과 일치 |
| 3 | Challenger-7-12 | 7 | opts[a] | sweet | sour | 이중답안(sweet·sour) 제거 — 보기 전면 교체 |
| 4 | Challenger-7-12 | 7 | opts[b] | sour | salty | 위 동일 |
| 5 | Challenger-7-12 | 7 | opts[c] | good | spicy | 위 동일 |
| 6 | Challenger-7-12 | 7 | answer | 1(sour) | 0(sour) | opts 재배열로 정답 인덱스 조정 |
| 7 | Challenger-7-12 | 23 | passage | "…comic books" | "…comic books." | 말미 마침표 누락 보정 |
| 8 | Challenger-7-12 | 30 | writing.ans | The lemonade tastes very sour. | He eats breakfast every morning. | 문항 전면 교체 (lemonade→breakfast) |
| 9 | Challenger-7-12 | 30 | writing.chunks | tastes/The/very/lemonade/sour | every/breakfast/eats/He/morning | 위 동일 |
| 10 | Explorer-7-12 | 5 | question | …very \_\_\_\_\_\_\_\_ dogs. | …dogs because they learn quickly. | 맥락 조건절 추가 (clever 단서 구체화) |
| 11 | Explorer-7-12 | 9 | question | **Falcons** are bigger than \_\_\_\_. | **Pigeons** are bigger than \_\_\_\_. | 주어 교체로 문항·정답 일치 |
| 12 | Explorer-7-12 | 9 | opts[a] | kittens | eagles | 보기 전면 교체 (Pigeons 문항 대응) |
| 13 | Explorer-7-12 | 9 | opts[b] | pigeons | chicks | 위 동일 |
| 14 | Explorer-7-12 | 9 | opts[c] | puppies | falcons | 위 동일 |
| 15 | Explorer-7-12 | 24 | opts[a] | They are clever | They are clever. | 마침표 누락 보정 (채점 정규화 통과) |
| 16 | Explorer-7-12 | 24 | opts[b] | They are colorful | They are colorful. | 위 동일 |
| 17 | Explorer-7-12 | 24 | opts[c] | They are quiet | They are quiet. | 위 동일 |
| 18 | Explorer-7-12 | 30 | writing.ans | I would rather get a parrot than a rabbit. | I would rather get a parrot. | "than a rabbit" 잉여 제거 |
| 19 | Explorer-7-12 | 30 | writing.chunks | than/rather/parrot/I/a/rabbit/a/get/would | rather/parrot/I/a/get/would | 잉여 조각(than/a/rabbit) 제거 |
| 20 | Inventor-1-6 | 2 | opts[c] | coconut | olive | 이중 정답(pineapple·coconut) 제거 |
| 21 | Inventor-1-6 | 12 | question | \_\_\_\_\_\_\_\_, heat the oven. | Before you start baking, …heat the oven. | 전치 문맥 추가 (부사 위치 단서 명확화) |
| 22 | Inventor-1-6 | 12 | opts[a] | Next | next | 소문자 통일 (정답=first와 형식 일치) |
| 23 | Inventor-1-6 | 12 | opts[b] | First | first | 위 동일 |
| 24 | Inventor-1-6 | 12 | opts[c] | Finally | finally | 위 동일 |
| 25 | Inventor-1-6 | 18 | opts[c] | could | were | 이중 정답(will·could) 제거 |

---

## B. NEW 덮어쓰기 후 확정값 적용 (4건)

| # | 세트 | 번호 | 필드 | 이전값(repo) | NEW값 | 확정값 | 사유 |
|---|------|------|------|-------------|-------|--------|------|
| 26 | Challenger-7-12 | 3 | opts[a] | o'clock | o'clock | **hour** | o'clock은 answer=1(thirty)과 혼용 가능 → 명백한 오답 'hour'로 교체 |
| 27 | Challenger-7-12 | 6 | opts[a] | ring | ring | **shoes** | ring은 answer=1(skirt)과 범주 중첩 → 이중답안 제거 |
| 28 | Explorer-7-12 | 8 | answer | 2(poster) | 2(poster) | **1(tour)** | BLOCKER: poster는 구매 불가 문맥 오류, tour(b)가 정답 |
| 29 | Inventor-1-6 | 17 | opts[a] | could | was | **could(유지)** | BLOCKER 보류: "We could ride bikes" 문맥상 적절, NEW 'was'는 문법 오류 가능성 |

---

## 지필 시험지 동반 수정 필요

아래 항목은 데이터만 수정됐으며 **출력된 지필 문제지에도 동일하게 반영해야 합니다.**

### B항목 4건 — 실무팀 최종 확인 후 지필 반영
- Challenger-7-12 Q3: opts[a] `o'clock` → `hour`
- Challenger-7-12 Q6: opts[a] `ring` → `shoes`
- Explorer-7-12 Q8: 정답 `c(poster)` → `b(tour)`
- Inventor-1-6 Q17: opts[a] `could` 유지 (NEW의 `was` 미적용)

### 한국어 지문 오기 (데이터 미반영 — 별도 처리 필요)
`questions.builder.json` Q22, Q28의 imageFile 필드 누락 문제는 Builder 문항 이미지 확보 후 별도 처리.

---

*적용 커밋은 이 파일과 함께 `public/questions.englab.json`, `scripts/compare-new-items.js`, `scripts/validate-items.js` 를 포함.*
