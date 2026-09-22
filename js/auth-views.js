/**
 * Écrans d'authentification : connexion, inscription, mot de passe oublié,
 * nouveau mot de passe.
 *
 * Aucun de ces écrans ne dit si un email possède déjà un compte (sauf le
 * refus d'inscription hors liste blanche, qui est voulu).
 */

import * as auth from './auth.js';
import { PASSWORD_MIN_LENGTH } from './config.js';
import { h, toast } from './ui.js';

/* ------------------------------------------------------------ briques */

function authCard(title, subtitle, ...body) {
  return h('div', { class: 'auth-wrap' },
    h('div', { class: 'card auth-card' },
      h('h1', {}, title),
      subtitle ? h('p', { class: 'auth-sub' }, subtitle) : null,
      ...body
    )
  );
}

function field(label, input, hint) {
  const id = 'f-' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    input,
    hint ? h('span', { class: 'hint' }, hint) : null
  );
}

function emailInput(autocomplete = 'email') {
  return h('input', {
    type: 'email', required: true, autocomplete, inputmode: 'email',
    autocapitalize: 'none', spellcheck: 'false', maxlength: 254
  });
}

/** Champ mot de passe avec bouton Afficher / Masquer. */
function passwordInput(autocomplete) {
  const input = h('input', { type: 'password', required: true, autocomplete, maxlength: 72 });
  const toggle = h('button', {
    class: 'btn ghost small pw-toggle', type: 'button', 'aria-label': 'Afficher le mot de passe',
    onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Masquer' : 'Afficher';
      toggle.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    }
  }, 'Afficher');
  const wrap = h('div', { class: 'pw-wrap' }, input, toggle);
  wrap.input = input;
  return wrap;
}

function pwField(label, pw, hint) {
  const id = 'f-' + Math.random().toString(36).slice(2, 8);
  pw.input.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    pw,
    hint ? h('span', { class: 'hint' }, hint) : null
  );
}

function messageBox() {
  const el = h('div', { class: 'auth-msg', role: 'alert', hidden: true });
  el.show = (text, kind = 'error') => {
    el.textContent = text;
    el.className = 'auth-msg ' + kind;
    el.hidden = false;
  };
  el.clear = () => { el.hidden = true; el.textContent = ''; };
  return el;
}

/** Soumission avec bouton désactivé pendant la requête (pas de double envoi). */
function onSubmit(form, button, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Patiente…';
    try {
      await handler();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}

const PW_HINT = `Au moins ${PASSWORD_MIN_LENGTH} caractères, avec au moins une lettre et un chiffre.`;

/* ------------------------------------------------------------- écrans */

export function viewSignIn({ notice } = {}) {
  const email = emailInput('username');
  const pw = passwordInput('current-password');
  const msg = messageBox();
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Se connecter');
  const resend = h('button', { class: 'btn small', type: 'button', hidden: true }, 'Renvoyer l’email de confirmation');

  const form = h('form', { class: 'stack', novalidate: true },
    field('Email', email),
    pwField('Mot de passe', pw),
    msg,
    resend,
    submit
  );

  if (notice) msg.show(notice, 'info');

  onSubmit(form, submit, async () => {
    msg.clear();
    resend.hidden = true;
    const address = auth.normalizeEmail(email.value);
    if (!auth.isValidEmail(address) || !pw.input.value) {
      msg.show('Renseigne ton email et ton mot de passe.');
      return;
    }
    const { error } = await auth.signIn(address, pw.input.value);
    if (error) {
      msg.show(auth.explain(error));
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')) resend.hidden = false;
      pw.input.value = '';
      return;
    }
    pw.input.value = '';
    // la suite est gérée par l'événement SIGNED_IN
  });

  resend.addEventListener('click', async () => {
    resend.disabled = true;
    const { error } = await auth.resendConfirmation(email.value);
    resend.disabled = false;
    msg.show(error ? auth.explain(error) : 'Si ce compte attend une confirmation, un nouvel email vient d’être envoyé.', error ? 'error' : 'info');
  });

  return authCard('Connexion', 'Accède à ton suivi.',
    form,
    h('div', { class: 'auth-links' },
      h('a', { href: '#/mot-de-passe-oublie' }, 'Mot de passe oublié ?'),
      h('a', { href: '#/inscription' }, 'Créer un compte')
    )
  );
}

export function viewSignUp() {
  const email = emailInput('email');
  const pw = passwordInput('new-password');
  const pw2 = passwordInput('new-password');
  const msg = messageBox();
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Créer mon compte');

  const form = h('form', { class: 'stack', novalidate: true },
    field('Email', email, 'Uniquement les emails autorisés par l’administrateur.'),
    pwField('Mot de passe', pw, PW_HINT),
    pwField('Confirme le mot de passe', pw2),
    msg,
    submit
  );

  const card = authCard('Créer un compte', 'Ton suivi sera privé : personne d’autre ne peut le voir.',
    form,
    h('div', { class: 'auth-links' }, h('a', { href: '#/connexion' }, 'J’ai déjà un compte'))
  );

  onSubmit(form, submit, async () => {
    msg.clear();
    const address = auth.normalizeEmail(email.value);
    if (!auth.isValidEmail(address)) { msg.show('Email invalide.'); return; }
    const problem = auth.checkPassword(pw.input.value, address);
    if (problem) { msg.show(problem); return; }
    if (pw.input.value !== pw2.input.value) { msg.show('Les deux mots de passe ne correspondent pas.'); return; }

    const { session, error } = await auth.signUp(address, pw.input.value);
    pw.input.value = '';
    pw2.input.value = '';
    if (error) { msg.show(auth.explain(error)); return; }
    if (session) return; // confirmation désactivée côté Supabase : connecté directement

    form.replaceWith(
      h('div', { class: 'stack' },
        h('div', { class: 'auth-msg info' },
          `Un email de confirmation a été envoyé à ${address}. Clique sur le lien qu’il contient, puis connecte-toi. ` +
          'Pense à regarder dans les spams.'),
        h('a', { class: 'btn primary block', href: '#/connexion' }, 'Aller à la connexion')
      )
    );
  });

  return card;
}

export function viewForgot() {
  const email = emailInput('email');
  const msg = messageBox();
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Envoyer le lien');

  const form = h('form', { class: 'stack', novalidate: true },
    field('Email du compte', email),
    msg,
    submit
  );

  onSubmit(form, submit, async () => {
    msg.clear();
    const address = auth.normalizeEmail(email.value);
    if (!auth.isValidEmail(address)) { msg.show('Email invalide.'); return; }
    const { error } = await auth.requestPasswordReset(address);
    // Même réponse que le compte existe ou non.
    if (error && (error.status === 429 || !navigator.onLine)) { msg.show(auth.explain(error)); return; }
    form.replaceWith(
      h('div', { class: 'auth-msg info' },
        `Si un compte existe pour ${address}, un email avec un lien vient d’être envoyé. ` +
        'Ouvre-le sur cet appareil et dans ce navigateur. Le lien n’est valable qu’une heure.')
    );
  });

  return authCard('Mot de passe oublié', 'Reçois un lien pour choisir un nouveau mot de passe.',
    form,
    h('div', { class: 'auth-links' }, h('a', { href: '#/connexion' }, 'Retour à la connexion'))
  );
}

/**
 * Choix d'un nouveau mot de passe après clic sur le lien reçu par email.
 * `hasSession` : le lien a bien ouvert une session de récupération.
 */
export function viewResetPassword({ hasSession, email, onDone }) {
  if (!hasSession) {
    return authCard('Lien invalide', null,
      h('div', { class: 'auth-msg error' },
        'Ce lien a expiré, a déjà servi, ou a été ouvert dans un autre navigateur que celui de la demande.'),
      h('div', { class: 'auth-links' }, h('a', { href: '#/mot-de-passe-oublie' }, 'Redemander un lien'))
    );
  }

  const pw = passwordInput('new-password');
  const pw2 = passwordInput('new-password');
  const msg = messageBox();
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Enregistrer le mot de passe');
  const form = h('form', { class: 'stack', novalidate: true },
    pwField('Nouveau mot de passe', pw, PW_HINT),
    pwField('Confirme le mot de passe', pw2),
    msg,
    submit
  );

  onSubmit(form, submit, async () => {
    msg.clear();
    const problem = auth.checkPassword(pw.input.value, email);
    if (problem) { msg.show(problem); return; }
    if (pw.input.value !== pw2.input.value) { msg.show('Les deux mots de passe ne correspondent pas.'); return; }
    const { error } = await auth.updatePassword(pw.input.value);
    pw.input.value = '';
    pw2.input.value = '';
    if (error) { msg.show(auth.explain(error)); return; }
    toast('Mot de passe modifié');
    onDone();
  });

  return authCard('Nouveau mot de passe', email ? `Compte : ${email}` : null, form);
}

/** Section « Mon compte » de la page Réglages. */
export function accountSection({ email, onSignOut }) {
  const current = passwordInput('current-password');
  const next = passwordInput('new-password');
  const next2 = passwordInput('new-password');
  const msg = messageBox();
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Changer le mot de passe');

  const form = h('form', { class: 'stack', novalidate: true },
    pwField('Mot de passe actuel', current),
    pwField('Nouveau mot de passe', next, PW_HINT),
    pwField('Confirme le nouveau mot de passe', next2),
    msg,
    h('div', { class: 'btn-row' }, submit)
  );

  onSubmit(form, submit, async () => {
    msg.clear();
    if (!current.input.value) { msg.show('Renseigne ton mot de passe actuel.'); return; }
    const problem = auth.checkPassword(next.input.value, email);
    if (problem) { msg.show(problem); return; }
    if (next.input.value !== next2.input.value) { msg.show('Les deux mots de passe ne correspondent pas.'); return; }
    const { error } = await auth.changePassword(email, current.input.value, next.input.value);
    current.input.value = '';
    next.input.value = '';
    next2.input.value = '';
    if (error) { msg.show(auth.explain(error)); return; }
    msg.show('Mot de passe modifié.', 'info');
  });

  return h('div', { class: 'card section' },
    h('h2', {}, 'Mon compte'),
    h('p', { class: 'desc' }, 'Connecté en tant que ', h('strong', {}, email), '.'),
    h('details', { class: 'accordion' },
      h('summary', {}, 'Changer le mot de passe'),
      form
    ),
    h('div', { class: 'btn-row section-actions' },
      h('button', { class: 'btn danger', type: 'button', onclick: onSignOut }, 'Se déconnecter')
    )
  );
}

export function viewNotConfigured() {
  return authCard('Configuration requise', null,
    h('div', { class: 'auth-msg error' },
      'La clé Supabase n’est pas renseignée dans js/config.js. Voir docs/SUPABASE.md.')
  );
}
