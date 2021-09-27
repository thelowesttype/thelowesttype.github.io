// Set darkmode
if (localStorage.getItem('theme') === null) {

  document.body.classList.add('dark');
  localStorage.setItem('theme', 'dark');

}

document.getElementById('mode').addEventListener('click', () => {

  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');

});

if (localStorage.getItem('theme') === 'dark') {

  document.body.classList.add('dark');

}
else {
  document.body.classList.add('light');
}
