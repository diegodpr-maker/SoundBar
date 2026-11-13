// Legacy installed shortcuts enter the regular application shell without auth.
const target=new URL('app.html',location.href);target.searchParams.set('offline','1');target.hash='downloads';location.replace(target.href);
