-- Enable after deploying soundbar-admin-push. Credentials stay in the private table.
select cron.schedule('harmony-admin-notifications','* * * * *',$job$select soundbar_private.sb_push_wake();$job$);
