// auth.js - Sistema de autenticación JWT
(function() {
  'use strict';

  // Verificar autenticación al cargar la página
  function checkAuth() {
    const token = localStorage.getItem('authToken');
    const tokenExpiry = localStorage.getItem('tokenExpiry');

    // Si no hay token, redirigir a login
    if (!token) {
      redirectToLogin();
      return;
    }

    // Verificar si el token ha expirado
    if (tokenExpiry && Date.now() > parseInt(tokenExpiry)) {
      console.log('Token expirado');
      logout();
      return;
    }

    // El token existe y no ha expirado, continuar
    console.log('Usuario autenticado');
  }

  // Obtener token para usar en peticiones
  function getToken() {
    return localStorage.getItem('authToken');
  }

  // Obtener headers de autorización
  function getAuthHeaders() {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      return {};
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // Hacer petición autenticada con fetch
  async function authenticatedFetch(url, options = {}) {
    const token = getToken();

    if (!token) {
      redirectToLogin();
      throw new Error('No hay token de autenticación');
    }

    // Agregar header de autorización
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      ...options,
      headers: headers
    });

    // Si la respuesta es 401 o 403, el token es inválido
    if (response.status === 401 || response.status === 403) {
      console.log('Token inválido o expirado, redirigiendo a login');
      logout();
      throw new Error('Sesión expirada');
    }

    return response;
  }

  // Cerrar sesión
  function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('tokenExpiry');
    redirectToLogin();
  }

  // Redirigir a login
  function redirectToLogin() {
    if (window.location.pathname !== '/login.html') {
      window.location.href = '/login.html';
    }
  }

  // Actualizar actividad del usuario (para renovar timeout)
  function updateActivity() {
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    if (tokenExpiry) {
      // Registrar actividad (el backend maneja la expiración real)
      console.log('Actividad detectada');
    }
  }

  // Agregar botón de logout si no existe
  function addLogoutButton() {
    // Solo en páginas que no sean login
    if (window.location.pathname === '/login.html') {
      return;
    }

    // Buscar el menú de navegación
    const nav = document.querySelector('nav .hidden.md\\:flex');
    if (nav && !document.getElementById('logoutBtn')) {
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'logoutBtn';
      logoutBtn.className = 'px-3 py-2 text-gray-300 hover:text-white transition-colors';
      logoutBtn.textContent = 'Cerrar Sesión';
      logoutBtn.onclick = logout;
      nav.appendChild(logoutBtn);
    }

    // Agregar también al menú móvil
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu && !document.getElementById('logoutBtnMobile')) {
      const mobileLinks = mobileMenu.querySelector('.space-y-1');
      if (mobileLinks) {
        const logoutBtnMobile = document.createElement('button');
        logoutBtnMobile.id = 'logoutBtnMobile';
        logoutBtnMobile.className = 'block w-full text-left px-3 py-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-600 transition-colors';
        logoutBtnMobile.textContent = 'Cerrar Sesión';
        logoutBtnMobile.onclick = logout;
        mobileLinks.appendChild(logoutBtnMobile);
      }
    }
  }

  // Monitorear actividad del usuario
  function setupActivityMonitoring() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    let activityTimeout;
    const ACTIVITY_DELAY = 60000; // 1 minuto

    events.forEach(event => {
      document.addEventListener(event, () => {
        clearTimeout(activityTimeout);
        activityTimeout = setTimeout(updateActivity, ACTIVITY_DELAY);
      });
    });
  }

  // Verificar periódicamente si el token ha expirado
  function setupTokenExpiryCheck() {
    setInterval(() => {
      const tokenExpiry = localStorage.getItem('tokenExpiry');
      if (tokenExpiry && Date.now() > parseInt(tokenExpiry)) {
        console.log('Token expirado, cerrando sesión');
        logout();
      }
    }, 30000); // Verificar cada 30 segundos
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkAuth();
      addLogoutButton();
      setupActivityMonitoring();
      setupTokenExpiryCheck();
    });
  } else {
    checkAuth();
    addLogoutButton();
    setupActivityMonitoring();
    setupTokenExpiryCheck();
  }

  // Exportar funciones útiles
  window.auth = {
    checkAuth,
    getToken,
    getAuthHeaders,
    authenticatedFetch,
    logout,
    updateActivity
  };
})();
