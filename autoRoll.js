// cube-auto.js
(function () {
  let autoRunning = false;
  let autoTimer = null;

  // ====== PartsType mapping (index.html 기준) ======
  const PARTS = {
    WEAPON: 1,
    EMBLEM: 2,
    SECONDARY: 3
  };

  const CUBE_ID_ADDI = "5062500";
  const CUBE_ID_MAIN = "5062010";

  function getSelectedPartsTypeSafe() {
    return typeof getSelectedPartsType === "function" ? getSelectedPartsType() : 0;
  }

  function isSupportedParts() {
    const p = getSelectedPartsTypeSafe();
    return p === PARTS.WEAPON || p === PARTS.SECONDARY || p === PARTS.EMBLEM;
  }

  function isWeaponOrSecondarySelected() {
    const p = getSelectedPartsTypeSafe();
    return p === PARTS.WEAPON || p === PARTS.SECONDARY;
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

  function getMainKeyword(mainStat) {
    // 기존 mainStat INT이면 "마력" 기준을 유지
    return mainStat === "INT" ? "마력" : "공격력";
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

  function countLines(lines, predicate) {
    if (!Array.isArray(lines)) return 0;
    let c = 0;
    for (const l of lines) if (predicate(l)) c++;
    return c;
  }

  function isMainValidSet(candLines, partsType, iedMaxN, bossMinM) {
    if (!Array.isArray(candLines) || candLines.length !== 3) return false;
    const mainStat = getMainStat();
  
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
      return true;
    }
  
    // 무기/보조무기
    const bossCount = countLines(candLines, isBossLine);
    if (bossCount < bossMinM) return false;
  
    // IED/Boss 제외 나머지 줄은 ATK/MATK% 이어야 유효
    for (const l of candLines) {
      if (isIEDLine(l)) continue;
      if (isBossLine(l)) continue;
      if (!isAtkLine(l, mainStat)) return false;
    }
    return true;
  }
  

  // ====== additional(아랫잠재) stop condition ======
  function hasSatisfiedCandidateAdditional(targetPercent) {
    if (!Array.isArray(rollCandidates)) return false;
    const mainStat = getMainStat();
    for (const cand of rollCandidates) {
      const total = getTotalAtkPercentInSet(cand, mainStat);
      if (total >= targetPercent) {
        return true;
      }
    }
    return false;
  }

  // ====== main(윗잠재) stop condition ======
  function hasSatisfiedCandidateMain(criteria) {
    if (!Array.isArray(rollCandidates)) return false;
    const partsType = getSelectedPartsTypeSafe();
    for (const cand of rollCandidates) {
      if (isMainValidSet(cand, partsType, criteria.iedMaxN, criteria.bossMinM)) {
        return true;
      }
    }
    return false;
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

  function updateBossMinOptions() {
    const bossMinSelect = document.getElementById("autoMainBossMin");
    const iedSelect = document.getElementById("autoMainIED");
    if (!bossMinSelect || !iedSelect) return;

    const iedN = Number(iedSelect.value);
    const maxBoss = Math.max(0, 3 - iedN);

    // 옵션 재구성 (기존 선택 값 유지 시도)
    const prev = Number(bossMinSelect.value);
    bossMinSelect.innerHTML = "";
    for (let i = 0; i <= maxBoss; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      bossMinSelect.appendChild(opt);
    }
    bossMinSelect.value = String(Math.min(prev || 0, maxBoss));
  }

  function setAutoKindVisibility() {
    const container = document.getElementById("weaponAutoContainer");
    if (!container) return;
    const addi = isAdditionalCubeSelected();

    container.querySelectorAll("[data-auto-kind='main']").forEach(el => {
      el.style.display = addi ? "none" : "block";
    });
    container.querySelectorAll("[data-auto-kind='addi']").forEach(el => {
      el.style.display = addi ? "block" : "none";
    });
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

    updateBossMinOptions();
    setAutoKindVisibility();
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
    }

    if (payload && payload.mode === "addi") {
      // 3줄 합산 %가 목표 이상인 세트가 하나라도 있으면 종료
      if (hasSatisfiedCandidateAdditional(payload.targetPercent)) {
        stopAuto();
        return;
      }
    } else if (payload && payload.mode === "main") {
      // 3줄 전체 기준 유효옵션 충족 시 종료
      if (hasSatisfiedCandidateMain(payload.criteria)) {
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
      alert("자동 돌리기는 무기/보조무기/엠블렘 부위에서만 사용할 수 있습니다.");
      return;
    }

    if (isAdditionalCubeSelected()) {
      // ====== additional(에디) ======
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
      autoStep({ mode: "addi", targetPercent });
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
    
    let bossMinM = 0;
    if (isWeaponOrSecondarySelected()) {
      const bossSelect = document.getElementById("autoMainBossMin");
      if (!bossSelect) {
        alert("윗잠재 자동돌리기 Boss 설정 UI를 찾을 수 없습니다.");
        return;
      }
      bossMinM = Number(bossSelect.value);
    
      // ✅ Boss dropdown은 0 ~ (3 - iedMaxN) 로 제한(요구사항)
      const maxBoss = 3 - iedMaxN;
      if (isNaN(bossMinM) || bossMinM < 0 || bossMinM > maxBoss) {
        alert("Boss 최소 줄 수가 올바르지 않습니다.");
        return;
      }
    }
    
    autoRunning = true;
    updateAutoButton(true);
    
    // ✅ criteria에 iedMaxN 전달
    autoStep({ mode: "main", criteria: { iedMaxN, bossMinM } });
    
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
        updateBossMinOptions();
        refreshAutoPanelVisibility();
      });
    }

    // 초기 boss dropdown 구성
    updateBossMinOptions();

    // 초기 상태 세팅
    refreshAutoPanelVisibility();
  });

})();
