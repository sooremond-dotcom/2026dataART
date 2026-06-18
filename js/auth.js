/*
 * auth.js — 간단 로그인 (이름 · 반-번호 · PIN 4자리)
 * -----------------------------------------------------------------------------
 * ⚠ 보안 주의: 4자리 PIN은 '진짜 보안'이 아니라 실수로 덮어쓰는 걸 막는 잠금 수준입니다.
 *   미성년자 정보이므로 학교 개인정보 방침을 먼저 확인하세요. 표시 이름은 학생이
 *   실명/이니셜/별명 중 고를 수 있습니다(기본값은 실명).
 */
(function (global) {
  'use strict';
  const K_SESSION = 'dn_session', K_USERS = 'dn_users';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function userKey(name, klass) { return (name || '').trim() + '#' + (klass || '').trim(); }

  const Auth = {
    // 로그인 또는 최초 등록. role: 'student' | 'teacher'
    login({ name, klass, pin, display, role }) {
      name = (name || '').trim();
      if (!name) throw new Error('이름을 입력하세요.');
      if (!/^\d{4}$/.test(pin || '')) throw new Error('PIN은 숫자 4자리여야 합니다.');
      const users = read(K_USERS);
      const key = userKey(name, klass);
      if (users[key]) {
        if (users[key].pin !== pin) throw new Error('PIN이 일치하지 않습니다.');
      } else {
        users[key] = { name, klass: klass || '', pin, role: role || 'student' };
        write(K_USERS, users);
      }
      const u = {
        userId: key, name, klass: klass || '',
        display: (display && display.trim()) || name,
        role: users[key].role || role || 'student',
        at: Date.now()
      };
      write(K_SESSION, u);
      return u;
    },
    current() { const s = read(K_SESSION); return s && s.userId ? s : null; },
    isTeacher() { const u = this.current(); return !!(u && u.role === 'teacher'); },
    setDisplay(display) {
      const s = this.current(); if (!s) return;
      s.display = (display || s.name); write(K_SESSION, s);
    },
    logout() { localStorage.removeItem(K_SESSION); },
    // 보호 페이지에서 사용: 로그인 안 되어 있으면 index 로 보냄
    requireLogin() {
      if (!this.current()) { location.href = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop()); return false; }
      return true;
    }
  };

  global.Auth = Auth;
})(window);
