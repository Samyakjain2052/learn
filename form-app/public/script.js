const form = document.getElementById('contact-form');
const statusEl = document.getElementById('status');
const submitBtn = form.querySelector('button');

// Browser-side validation: quick feedback only, the server re-checks everything
function validate({ name, email, message }) {
  const errors = {};
  if (!name) errors.name = 'Name is required';
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email is not valid';
  if (!message) errors.message = 'Message is required';
  return errors;
}

function showErrors(errors) {
  for (const field of ['name', 'email', 'message']) {
    form.querySelector(`[data-for="${field}"]`).textContent = errors[field] || '';
    form.elements[field].classList.toggle('invalid', Boolean(errors[field]));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stop the browser's default page-reloading submit
  statusEl.textContent = '';
  statusEl.className = '';

  const data = {
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    message: form.elements.message.value.trim(),
  };

  const errors = validate(data);
  showErrors(errors);
  if (Object.keys(errors).length > 0) return;

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();

    if (res.ok) {
      form.reset();
      statusEl.textContent = 'Thanks! Your message has been received.';
      statusEl.className = 'success';
    } else {
      showErrors(body.errors || {});
      statusEl.textContent = (body.errors && body.errors.form) || 'Please fix the errors above.';
      statusEl.className = 'fail';
    }
  } catch (err) {
    statusEl.textContent = 'Could not reach the server. Try again.';
    statusEl.className = 'fail';
  } finally {
    submitBtn.disabled = false;
  }
});
