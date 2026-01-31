// cube-auto.js
(function () {
  let autoRunning = false;
  let autoTimer = null;

  // ====== PartsType mapping (index.html 기준) ======
  const PARTS = {
    WEAPON: 1,
    EMBLEM: 2,
    SECONDARY: 3,        // 보조무기(포스실드 제외)
    FORCE_SHIELD: 4,     // 포스실드/소울링
    SHIELD: 5,           // 방패
    HAT: 6,
    TOP: 7,
    OVERALL: 8,
    BOTTOM: 9,
    SHOES: 10,
    GLOVE: 11,
    CAPE: 12,
    BELT: 13,
    SHOULDER: 14,
    FACE: 15,
    EYE: 16,
    EARRING: 17,
    RING: 18,
    PENDANT: 19,
    HEART: 20
  };

  const WEAPON_PARTS = new Set([
    PARTS.WEAPON,
    PARTS.EMBLEM,
    PARTS.SECONDARY,
    PARTS.FORCE_SHIELD,
    PARTS.SHIELD
  ]);

  const ACCESSORY_PARTS = new Set([
    PARTS.FACE,
    PARTS.EYE,
    PARTS.EARRING,
    PARTS.RING,
    PARTS.PENDANT
  ]);

  const ARMOR_PARTS = new Set([
    PARTS.HAT,
    PARTS.TOP,
    PARTS.OVERALL,
    PARTS.BOTTOM,
    PARTS.SHOES,
    PARTS.GLOVE,
    PARTS.CAPE,
    PARTS.BELT,
    PARTS.SHOULDER,
    PARTS.HEART
  ]);

  const CUBE_ID_ADDI = "5062500";
  const CUBE_ID_MAIN = "5062010";

  function getSelectedPartsTypeSafe() {
    return typeof getSelectedPartsType === "function" ? getSelectedPartsType() : 0;
  }

  function getSelectedLevelSafe() {
    return typeof getSelectedLevel === "function" ? getSelectedLevel() : 0;
  }

  function isWeaponPartsType(p) {
    return WEAPON_PARTS.has(p);
  }

  function isAccessoryPartsType(p) {
    return ACCESSORY_PARTS.has(p);
  }

  function isArmorPartsType(p) {
    return ARMOR_PARTS.has(p);
  }

  function isSupportedParts() {
    const p = getSelectedPartsTypeSafe();
    if (isAdditionalCubeSelected()) {
      return isWeaponPartsType(p) || isAccessoryPartsType(p) || isArmorPartsType(p);
    }
    return isWeaponPartsType(p) || isAccessoryPartsType(p) || isArmorPartsType(p);
  }

  function isWeaponOrSecondarySelected() {
    const p = getSelectedPartsTypeSafe();
    return isWeaponPartsType(p) && p !== PARTS.EMBLEM;
  }
  
  function getSelectedCubeIdSafe() {
    return typeof getSelectedCubeId === "function" ? getSelectedCubeId() : CUBE_ID_MAIN;
  }

  function isAdditionalCubeSelected() {
    return getSelectedCubeIdSafe() === CUBE_ID_ADDI;
  }

  function getMainStat() {
    if (typeof getSelectedMainStat === "function") {
      return getSelectedMainStat();
    }
    return "STR";
  }

  function getEffectiveMainStat() {
    const stat = getMainStat();
    if (stat === "ANY" && isWeaponPartsType(getSelectedPartsTypeSafe())) {
      return "STR";
    }
    return stat;
  }

  function getMainKeyword(mainStat) {
    // 기존 mainStat INT이면 "마력" 기준을 유지
    return mainStat === "INT" ? "마력" : "공격력";
  }

  const line1OptionCache = new Map();

  function getLine1OptionSet(context) {
    if (!context || typeof getBasePool !== "function") return null;
    const key = `${context.cubeItemID}-${context.partsType}-${context.level}`;
    if (line1OptionCache.has(key)) return line1OptionCache.get(key);

    const pool = getBasePool(context.cubeItemID, context.partsType, context.level, 1);
    if (!Array.isArray(pool) || pool.length === 0) {
      line1OptionCache.set(key, null);
      return null;
    }
    const set = new Set(pool.map(row => row.optionText));
    line1OptionCache.set(key, set);
    return set;
  }

  function hasDepartureLine(candLines, context) {
    if (!Array.isArray(candLines) || candLines.length !== 3) return false;
    const line1Set = getLine1OptionSet(context);
    if (!line1Set) return false;
    for (let i = 1; i < candLines.length; i++) {
      const text = candLines[i] && candLines[i].optionText ? candLines[i].optionText : "";
      if (text && line1Set.has(text)) return true;
    }
    return false;
  }

  function getAdditionalMainStatTypes(statType) {
    if (statType === "ANY") {
      return ["STR", "DEX", "INT", "LUK"];
    }
    if (statType === "ALLSTAT") {
      return ["STR", "DEX", "LUK"];
    }
    return [statType];
  }

  // ====== Line identifier helpers (옵션 텍스트 기반) ======
  function isIEDLine(line) {
    const text = (line && line.optionText) ? line.optionText : "";
    // "몬스터 방어율 무시" / "방어율 무시" 등 폭넓게 수용
    return text.includes("방어") && text.includes("무시") && (text.includes("율") || text.includes("방어력"));
  }

  function isBossLine(line) {
    const text = (line && line.optionText) ? line.optionText : "";
    return (text.includes("보스") && text.includes("데미지")) || text.includes("보스 몬스터") || text.includes("보스 공격");
  }

  function isAtkLine(line, mainStat) {
    const text = (line && line.optionText) ? line.optionText : "";
    const keyword = getMainKeyword(mainStat);
    if (!text.includes(keyword)) return false;
    // % 기반 옵션만 인정
    return /\+(\d+)%/.test(text);
  }

  // candLines: rollOneSet으로 나온 3줄짜리 배열
  // 👉 세 줄에 포함된 공격력/마력 %를 모두 합산
  function getTotalAtkPercentInSet(candLines, mainStat) {
    if (!candLines) return 0;
    const keyword = getMainKeyword(mainStat);
    let sum = 0;
    for (const line of candLines) {
      const text = line.optionText || "";
      if (!text.includes(keyword)) continue;
      const m = text.match(/\+(\d+)%/);
      if (!m) continue;
      const val = parseInt(m[1], 10);
      if (!isNaN(val)) sum += val;
    }
    return sum;
  }

  function getStatTotalsInSet(candLines) {
    const totals = { STR: 0, DEX: 0, INT: 0, LUK: 0, ALLSTAT: 0 };
    if (!Array.isArray(candLines)) return totals;
    for (const line of candLines) {
      const text = line.optionText || "";
      const statMatch = text.match(/^(STR|DEX|INT|LUK) \+(\d+)%/);
      if (statMatch) {
        const value = parseInt(statMatch[2], 10);
        if (!isNaN(value)) {
          totals[statMatch[1]] += value;
        }
      }
      const allMatch = text.match(/^올스탯 \+(\d+)%/);
      if (allMatch) {
        const value = parseInt(allMatch[1], 10);
        if (!isNaN(value)) {
          totals.ALLSTAT += value;
        }
      }
    }
    return totals;
  }

  function getStatTotalByType(candLines, statType) {
    const totals = getStatTotalsInSet(candLines);
    if (statType === "ANY") {
      return Math.max(
        totals.STR + totals.ALLSTAT,
        totals.DEX + totals.ALLSTAT,
        totals.INT + totals.ALLSTAT,
        totals.LUK + totals.ALLSTAT
      );
    }
    if (statType === "ALLSTAT") {
      return totals.ALLSTAT + (totals.STR + totals.DEX + totals.LUK) / 3;
    }
    return (totals[statType] || 0) + totals.ALLSTAT;
  }

  function getCooldownTotal(candLines) {
    if (!Array.isArray(candLines)) return 0;
    let sum = 0;
    for (const line of candLines) {
      const text = line.optionText || "";
      const match = text.match(/재사용 대기시간 -(\d+)초/);
      if (match) {
        const value = parseInt(match[1], 10);
        if (!isNaN(value)) sum += value;
      }
    }
    return sum;
  }

  function countCritDamageLines(candLines) {
    if (!Array.isArray(candLines)) return 0;
    let count = 0;
    for (const line of candLines) {
      const text = line.optionText || "";
      if (text.includes("크리티컬 데미지")) count += 1;
    }
    return count;
  }

  function countDropMesoLines(candLines) {
    if (!Array.isArray(candLines)) return 0;
    let count = 0;
    for (const line of candLines) {
      const text = line.optionText || "";
      if (text.includes("메소 획득량") || text.includes("아이템 드롭률")) {
        count += 1;
      }
    }
    return count;
  }

  function countLines(lines, predicate) {
    if (!Array.isArray(lines)) return 0;
    let c = 0;
    for (const l of lines) if (predicate(l)) c++;
    return c;
  }

  function isAllStatPercentLine(line) {
    const text = (line && line.optionText) ? line.optionText : "";
    return /^올스탯 \+\d+%$/.test(text);
  }

  function isMainStatPercentLine(line, statType) {
    const text = (line && line.optionText) ? line.optionText : "";
    const types = getAdditionalMainStatTypes(statType);
    if (statType === "ALLSTAT" && isAllStatPercentLine(line)) return true;
    return types.some(type => new RegExp(`^${type} \\+\\d+%$`).test(text));
  }

  function isMainStatFlatLine(line, statType) {
    const text = (line && line.optionText) ? line.optionText : "";
    const types = getAdditionalMainStatTypes(statType);
    return types.some(type => new RegExp(`^${type} \\+\\d+$`).test(text));
  }

  function isAdditionalAttackFlatLine(line, statType) {
    const text = (line && line.optionText) ? line.optionText : "";
    if (statType === "INT") {
      return /^마력 \+\d+$/.test(text);
    }
    if (statType === "ANY") {
      return /^(공격력|마력) \+\d+$/.test(text);
    }
    return /^공격력 \+\d+$/.test(text);
  }

  function isAdditionalCritDamageLine(line) {
    const text = (line && line.optionText) ? line.optionText : "";
    return /^크리티컬 데미지 \+\d+%$/.test(text);
  }

  function isAdditionalCooldownLine(line) {
    const text = (line && line.optionText) ? line.optionText : "";
    return text === "스킬 재사용 대기시간 -1초";
  }

  function isAdditionalPerLevelStatLine(line, statType) {
    const text = (line && line.optionText) ? line.optionText : "";
    const types = getAdditionalMainStatTypes(statType);
    return types.some(type => new RegExp(`^캐릭터 기준 9레벨 당 ${type} \\+\\d+$`).test(text));
  }

  function isAdditionalValidLine(line, statType) {
    return (
      isMainStatPercentLine(line, statType) ||
      isAllStatPercentLine(line) ||
      isMainStatFlatLine(line, statType) ||
      isAdditionalAttackFlatLine(line, statType) ||
      isAdditionalCritDamageLine(line) ||
      isAdditionalCooldownLine(line) ||
      isAdditionalPerLevelStatLine(line, statType)
    );
  }

  function isAllStatSelection(statType) {
    return statType === "ALLSTAT";
  }

  function isAdditionalStatValidSet(candLines, criteria) {
    if (!Array.isArray(candLines) || candLines.length !== 3) return false;
    const cooldownLines = countLines(candLines, isAdditionalCooldownLine);
    if (cooldownLines >= 2) return true;
    if (criteria.requireCooldown && cooldownLines < 1) return false;
    const validCount = countLines(candLines, line => isAdditionalValidLine(line, criteria.statType));
    const allStatCount = isAllStatSelection(criteria.statType)
      ? countLines(candLines, isAllStatPercentLine)
      : 0;

    if (isAllStatSelection(criteria.statType)) {
      if (criteria.requiredLines === 2 && allStatCount < 1) return false;
      if (criteria.requiredLines === 3 && allStatCount < 2) return false;
    }

    if (criteria.requiredLines === 2) {
      return validCount >= 2;
    }

    if (validCount >= 3) return true;

    const firstLine = candLines[0];
    const secondLine = candLines[1];
    const firstIsMainPercent = isMainStatPercentLine(firstLine, criteria.statType);
    const secondIsMainPercent = isMainStatPercentLine(secondLine, criteria.statType) || isAllStatPercentLine(secondLine);
    return firstIsMainPercent && secondIsMainPercent;
  }

  function isMainValidSet(candLines, context, criteria) {
    if (!Array.isArray(candLines) || candLines.length !== 3) return false;
    const partsType = context.partsType;
    const iedMaxN = criteria.iedMaxN;
    const bossMaxM = criteria.bossMaxM;
    const mainStat = getEffectiveMainStat();
  
    const iedCount = countLines(candLines, isIEDLine);
  
    // ✅ 변경: "정확히 N"이 아니라 "최대 N" (0~N 허용)
    if (iedCount > iedMaxN) return false;
  
    if (partsType === PARTS.EMBLEM) {
      // 엠블렘: Boss 없음 (혹시 데이터에 섞이면 무효 처리)
      const bossCount = countLines(candLines, isBossLine);
      if (bossCount > 0) return false;
  
      // IED가 아닌 줄은 전부 ATK/MATK% 이어야 함
      for (const l of candLines) {
        if (isIEDLine(l)) continue;
        if (!isAtkLine(l, mainStat)) return false;
      }
      return !criteria.seekDeparture || hasDepartureLine(candLines, context);
    }
  
    // 무기/보조무기
    const bossCount = countLines(candLines, isBossLine);
    if (bossCount > bossMaxM) return false;
  
    // IED/Boss 제외 나머지 줄은 ATK/MATK% 이어야 유효
    for (const l of candLines) {
      if (isIEDLine(l)) continue;
      if (isBossLine(l)) continue;
      if (!isAtkLine(l, mainStat)) return false;
    }
    if (criteria.seekDeparture && !hasDepartureLine(candLines, context)) return false;
    return true;
  }

  function isStatValidSet(candLines, partsType, criteria) {
    if (!Array.isArray(candLines) || candLines.length !== 3) return false;
    const baseStatTotal = getStatTotalByType(candLines, criteria.statType);
    const critLines = partsType === PARTS.GLOVE ? countCritDamageLines(candLines) : 0;
    const statTotal =
      partsType === PARTS.GLOVE && criteria.minCritLines === 0
        ? baseStatTotal + critLines * 32
        : baseStatTotal;

    if (partsType === PARTS.HAT && criteria.minCooldown > 0) {
      const cooldownTotal = getCooldownTotal(candLines);
      if (cooldownTotal >= criteria.minCooldown + 1) return true;
      return statTotal >= criteria.targetPercent && cooldownTotal >= criteria.minCooldown;
    }

    if (partsType === PARTS.GLOVE && criteria.minCritLines > 0) {
      if (critLines >= criteria.minCritLines + 1) return true;
      return baseStatTotal >= criteria.targetPercent && critLines >= criteria.minCritLines;
    }

    if (isAccessoryPartsType(partsType) && criteria.minDropMesoLines > 0) {
      const dropMesoLines = countDropMesoLines(candLines);
      if (dropMesoLines >= criteria.minDropMesoLines + 1) return true;
      return statTotal >= criteria.targetPercent && dropMesoLines >= criteria.minDropMesoLines;
    }

    return statTotal >= criteria.targetPercent;
  }


  // ====== additional(아랫잠재) stop condition ======
  function hasSatisfiedCandidateAdditional(targetPercent) {
    if (!Array.isArray(rollCandidates)) return false;
    const mainStat = getEffectiveMainStat();
    for (const cand of rollCandidates) {
      const total = getTotalAtkPercentInSet(cand, mainStat);
      if (total >= targetPercent) {
        return true;
      }
    }
    return false;
  }

  function hasSatisfiedCandidateAdditionalStat(criteria) {
    if (!Array.isArray(rollCandidates)) return false;
    for (const cand of rollCandidates) {
      if (isAdditionalStatValidSet(cand, criteria)) {
        return true;
      }
    }
    return false;
  }

  // ====== main(윗잠재) stop condition ======
  function hasSatisfiedCandidateMain(criteria) {
    if (!Array.isArray(rollCandidates)) return false;
    const context = {
      cubeItemID: getSelectedCubeIdSafe(),
      partsType: getSelectedPartsTypeSafe(),
      level: getSelectedLevelSafe()
    };
    for (const cand of rollCandidates) {
      if (isMainValidSet(cand, context, criteria)) {
        return true;
      }
    }
    return false;
  }

  // ====== stat(장신구/방어구) stop condition ======
  function hasSatisfiedCandidateStat(criteria) {
    if (!Array.isArray(rollCandidates)) return false;
    const partsType = getSelectedPartsTypeSafe();
    for (const cand of rollCandidates) {
      if (isStatValidSet(cand, partsType, criteria)) {
        return true;
      }
    }
    return false;
  }

  function clearAutoHitUI() {
    ["box-roll1", "box-roll2", "box-roll3"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove("auto-hit");
      el.classList.remove("auto-hit-flash");
    });
  }
  
  // 조건을 만족하는 후보들에 골드 하이라이트 적용
  function applyAutoHitUIForCandidates(predicate) {
    // predicate(candLines) => boolean
    const ids = ["box-roll1", "box-roll2", "box-roll3"];
  
    for (let i = 0; i < 3; i++) {
      const cand = Array.isArray(rollCandidates) ? rollCandidates[i] : null;
      if (!cand) continue;
  
      if (predicate(cand)) {
        const el = document.getElementById(ids[i]);
        if (!el) continue;
  
        el.classList.add("auto-hit");
        el.classList.add("auto-hit-flash");
  
        // flash는 끝나면 제거, hit는 유지
        el.addEventListener("animationend", () => {
          el.classList.remove("auto-hit-flash");
        }, { once: true });
      }
    }
  }

  
  

  function updateAutoButton(running) {
    const btn = document.getElementById("autoRollBtn");
    if (!btn) return;
    btn.textContent = running ? "자동 돌리기 정지" : "자동 돌리기 시작";

    // 지원 부위가 아니면 시작 불가 (진행 중일 때는 정지 가능)
    const supported = isSupportedParts();
    btn.disabled = !supported && !running;
    btn.style.opacity = (!supported && !running) ? 0.5 : 1;
  }

  function updateBossMaxOptions() {
    const bossMaxSelect = document.getElementById("autoMainBossMin");
    const iedSelect = document.getElementById("autoMainIED");
    if (!bossMaxSelect || !iedSelect) return;

    const iedN = Number(iedSelect.value);
    const maxBoss = Math.max(0, 3 - iedN);

    // 옵션 재구성 (기존 선택 값 유지 시도)
    const prev = Number(bossMaxSelect.value);
    bossMaxSelect.innerHTML = "";
    for (let i = 0; i <= maxBoss; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      bossMaxSelect.appendChild(opt);
    }
    bossMaxSelect.value = String(Math.min(prev || 0, maxBoss));
  }

  function setAutoKindVisibility() {
    const container = document.getElementById("weaponAutoContainer");
    if (!container) return;
    const addi = isAdditionalCubeSelected();
    const partsType = getSelectedPartsTypeSafe();
    const isWeapon = isWeaponPartsType(partsType);
    const isAccessory = isAccessoryPartsType(partsType);
    const isArmor = isArmorPartsType(partsType);

    container.querySelectorAll("[data-auto-kind='main']").forEach(el => {
      el.style.display = !addi && isWeapon ? "block" : "none";
    });
    container.querySelectorAll("[data-auto-kind='addi-weapon']").forEach(el => {
      el.style.display = addi && isWeapon ? "block" : "none";
    });
    container.querySelectorAll("[data-auto-kind='addi-stat']").forEach(el => {
      el.style.display = addi && (isAccessory || isArmor) ? "block" : "none";
    });
    container.querySelectorAll("[data-auto-kind='stat']").forEach(el => {
      el.style.display = !addi && (isAccessory || isArmor) ? "block" : "none";
    });
  }

  function updateMainStatAvailability() {
    const anyRadio = document.querySelector('input[name="mainStat"][value="ANY"]');
    if (!anyRadio) return;
    const isWeapon = isWeaponPartsType(getSelectedPartsTypeSafe());
    anyRadio.disabled = isWeapon;
    if (isWeapon && anyRadio.checked) {
      const fallback = document.querySelector('input[name="mainStat"][value="STR"]');
      if (fallback) fallback.checked = true;
    }
  }

  function updateSpecialOptionVisibility() {
    const partsType = getSelectedPartsTypeSafe();
    const cooldownRow = document.getElementById("armorCooldownRow");
    const critRow = document.getElementById("armorCritRow");
    const dropRow = document.getElementById("accessoryDropRow");
    const addiCooldownRow = document.getElementById("additionalCooldownRow");

    if (cooldownRow) cooldownRow.style.display = partsType === PARTS.HAT ? "flex" : "none";
    if (critRow) critRow.style.display = partsType === PARTS.GLOVE ? "flex" : "none";
    if (dropRow) dropRow.style.display = isAccessoryPartsType(partsType) ? "flex" : "none";
    if (addiCooldownRow) {
      addiCooldownRow.style.display = isAdditionalCubeSelected() && partsType === PARTS.HAT ? "flex" : "none";
    }
  }

  function refreshAutoPanelVisibility() {
    const container = document.getElementById("weaponAutoContainer");
    const supported = isSupportedParts();

    if (container) {
      container.style.display = supported ? "block" : "none";
    }
    if (!supported) {
      stopAuto();
    }

    // Boss UI: 무기/보조무기에서만 노출
    const bossRow = document.getElementById("autoMainBossRow");
    if (bossRow) {
      bossRow.style.display = isWeaponOrSecondarySelected() ? "flex" : "none";
    }

    updateBossMaxOptions();
    setAutoKindVisibility();
    updateSpecialOptionVisibility();
    updateMainStatAvailability();
    updateAutoButton(autoRunning);
  }

  function autoStep(payload) {
    if (!autoRunning) return;

    if (!isSupportedParts()) {
      stopAuto();
      return;
    }

    // 한 번 세트 롤
    if (typeof doOneRollStep === "function") {
      doOneRollStep();
      clearAutoHitUI();
    }

    if (payload && payload.mode === "addi-weapon") {
      // 3줄 합산 %가 목표 이상인 세트가 하나라도 있으면 종료
      if (hasSatisfiedCandidateAdditional(payload.targetPercent)) {
        applyAutoHitUIForCandidates(cand => {
          const mainStat = getEffectiveMainStat();
          return getTotalAtkPercentInSet(cand, mainStat) >= payload.targetPercent;
        });
        stopAuto();
        return;
      }
    } else if (payload && payload.mode === "addi-stat") {
      if (hasSatisfiedCandidateAdditionalStat(payload.criteria)) {
        applyAutoHitUIForCandidates(cand => {
          return isAdditionalStatValidSet(cand, payload.criteria);
        });
        stopAuto();
        return;
      }
    } else if (payload && payload.mode === "main") {
      // 3줄 전체 기준 유효옵션 충족 시 종료
      if (hasSatisfiedCandidateMain(payload.criteria)) {
        const context = {
          cubeItemID: getSelectedCubeIdSafe(),
          partsType: getSelectedPartsTypeSafe(),
          level: getSelectedLevelSafe()
        };
        applyAutoHitUIForCandidates(cand => {
          return isMainValidSet(cand, context, payload.criteria);
        });
        stopAuto();
        return;
      }      
    } else if (payload && payload.mode === "stat") {
      if (hasSatisfiedCandidateStat(payload.criteria)) {
        const partsType = getSelectedPartsTypeSafe();
        applyAutoHitUIForCandidates(cand => {
          return isStatValidSet(cand, partsType, payload.criteria);
        });
        stopAuto();
        return;
      }
    }

    // 다시 반복
    autoTimer = setTimeout(() => autoStep(payload), 0);
  }

  function startAuto() {
    if (autoRunning) return;

    if (!isSupportedParts()) {
      alert("선택한 부위/큐브 종류에서는 자동 돌리기를 사용할 수 없습니다.");
      return;
    }

    if (isAdditionalCubeSelected()) {
      // ====== additional(에디) ======
      const partsType = getSelectedPartsTypeSafe();
      if (isWeaponPartsType(partsType)) {
        const targetInput = document.getElementById("weaponAutoTarget");
        if (!targetInput) {
          alert("자동 돌리기 목표 % 입력칸을 찾을 수 없습니다.");
          return;
        }
        const targetPercent = Number(targetInput.value);
        if (!targetPercent || targetPercent <= 0) {
          alert("올바른 목표 %를 입력해주세요.");
          return;
        }

        autoRunning = true;
        updateAutoButton(true);
        autoStep({ mode: "addi-weapon", targetPercent });
        return;
      }

      if (!(isAccessoryPartsType(partsType) || isArmorPartsType(partsType))) {
        alert("아랫잠재 자동 돌리기는 장신구/방어구에서만 사용할 수 있습니다.");
        return;
      }

      const requiredLinesSelect = document.getElementById("additionalAutoLines");
      if (!requiredLinesSelect) {
        alert("아랫잠재 자동 돌리기 유효 옵션 줄 수 입력칸을 찾을 수 없습니다.");
        return;
      }
      const requiredLines = Number(requiredLinesSelect.value);
      if (requiredLines !== 2 && requiredLines !== 3) {
        alert("올바른 유효 옵션 줄 수를 선택해주세요.");
        return;
      }

      const statType = getMainStat();
      const cooldownRequiredInput = document.getElementById("additionalCooldownRequired");
      const requireCooldown =
        partsType === PARTS.HAT && cooldownRequiredInput ? cooldownRequiredInput.checked : false;

      autoRunning = true;
      updateAutoButton(true);
      autoStep({
        mode: "addi-stat",
        criteria: {
          requiredLines,
          statType,
          requireCooldown
        }
      });
      return;
    }

    const partsType = getSelectedPartsTypeSafe();
    if (!isWeaponPartsType(partsType)) {
      // ====== stat(장신구/방어구) ======
      const targetInput = document.getElementById("armorAutoTarget");
      if (!targetInput) {
        alert("장신구/방어구 자동 돌리기 목표 % 입력칸을 찾을 수 없습니다.");
        return;
      }
      const targetPercent = Number(targetInput.value);
      if (isNaN(targetPercent) || targetPercent < 0) {
        alert("올바른 목표 %를 입력해주세요.");
        return;
      }

      const statType = getMainStat();

      let minCooldown = 0;
      const cooldownSelect = document.getElementById("armorCooldownMin");
      if (cooldownSelect && partsType === PARTS.HAT) {
        minCooldown = Number(cooldownSelect.value);
      }

      let minCritLines = 0;
      const critSelect = document.getElementById("armorCritMin");
      if (critSelect && partsType === PARTS.GLOVE) {
        minCritLines = Number(critSelect.value);
      }

      let minDropMesoLines = 0;
      const dropSelect = document.getElementById("accessoryDropMin");
      if (dropSelect && isAccessoryPartsType(partsType)) {
        minDropMesoLines = Number(dropSelect.value);
      }

      autoRunning = true;
      updateAutoButton(true);
      autoStep({
        mode: "stat",
        criteria: {
          targetPercent,
          statType,
          minCooldown,
          minCritLines,
          minDropMesoLines
        }
      });
      return;
    }

    // ====== main(윗잠재) ======
    const iedSelect = document.getElementById("autoMainIED");
    if (!iedSelect) {
      alert("윗잠재 자동돌리기 IED 설정 UI를 찾을 수 없습니다.");
      return;
    }

    const iedMaxN = Number(iedSelect.value);
    if (isNaN(iedMaxN) || iedMaxN < 0 || iedMaxN > 3) {
      alert("IED 줄 수가 올바르지 않습니다.");
      return;
    }
    
    let bossMaxM = 0;
    if (isWeaponOrSecondarySelected()) {
      const bossSelect = document.getElementById("autoMainBossMin");
      if (!bossSelect) {
        alert("윗잠재 자동돌리기 Boss 설정 UI를 찾을 수 없습니다.");
        return;
      }
      bossMaxM = Number(bossSelect.value);
    
      // ✅ Boss dropdown은 0 ~ (3 - iedMaxN) 로 제한(요구사항)
      const maxBoss = 3 - iedMaxN;
      if (isNaN(bossMaxM) || bossMaxM < 0 || bossMaxM > maxBoss) {
        alert("Boss 최대 줄 수가 올바르지 않습니다.");
        return;
      }
    }
    
    autoRunning = true;
    updateAutoButton(true);

    const seekDepartureInput = document.getElementById("autoMainSeekDeparture");
    const seekDeparture = seekDepartureInput ? seekDepartureInput.checked : false;
    
    // ✅ criteria에 iedMaxN 전달
    autoStep({ mode: "main", criteria: { iedMaxN, bossMaxM, seekDeparture } });
    
  }

  function stopAuto() {
    autoRunning = false;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    updateAutoButton(false);
  }

  // DOM 준비 후 이벤트 연결
  window.addEventListener("DOMContentLoaded", () => {
    const autoBtn = document.getElementById("autoRollBtn");
    if (autoBtn) {
      autoBtn.addEventListener("click", () => {
        if (autoRunning) {
          stopAuto();
        } else {
          startAuto();
        }
      });
      // 적용 및 리셋 클릭 시 하이라이트 제거
      const applyResetBtn = document.getElementById("applyResetBtn");
      if (applyResetBtn) {
        applyResetBtn.addEventListener("click", () => {
          clearAutoHitUI();
        });
      }

      const autoResetBtn = document.getElementById("autoResetBtn");
      if (autoResetBtn) {
        autoResetBtn.addEventListener("click", () => {
          clearAutoHitUI();
        });
      }

      // 큐브 종류 변경 시 하이라이트 제거 (이미 refreshAutoPanelVisibility를 걸어둔 곳에 같이 넣어도 됨)
      document.querySelectorAll('input[name="cubeKind"]').forEach(r => {
        r.addEventListener("change", () => {
          clearAutoHitUI();
        });
      });

      // 부위 변경 시에도 남아있으면 혼동되므로 제거(권장)
      const partsSelect2 = document.getElementById("partsType");
      if (partsSelect2) {
        partsSelect2.addEventListener("change", () => {
          clearAutoHitUI();
        });
      }
    }

    const partsSelect = document.getElementById("partsType");
    if (partsSelect) {
      partsSelect.addEventListener("change", refreshAutoPanelVisibility);
    }

    // cubeKind 변경 시 (윗/에디) UI 토글
    document.querySelectorAll('input[name="cubeKind"]').forEach(r => {
      r.addEventListener("change", () => {
        refreshAutoPanelVisibility();
      });
    });

    // IED 변경 시 boss dropdown 범위 갱신
    const iedSelect = document.getElementById("autoMainIED");
    if (iedSelect) {
      iedSelect.addEventListener("change", () => {
        updateBossMaxOptions();
        refreshAutoPanelVisibility();
      });
    }
    

    // 초기 boss dropdown 구성
    updateBossMaxOptions();

    // 초기 상태 세팅
    refreshAutoPanelVisibility();
  });

})();
