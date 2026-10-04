begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;
    if not (select rolsuper from pg_catalog.pg_roles where rolname = session_user) then
        execute format('grant app_owner to %I with inherit true, set true', session_user);
        execute format('grant app_executor to %I with set true, inherit false', session_user);
    end if;
end
$$;
set local role app_owner;

-- Keep the result bounded; compute per-candidate details only after paging.
create function app.list_candidate_profile_directory_v1(p_query text, p_page integer)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
begin
    perform app.recruitment_actor_v1(array['candidates.read'], null, null, false);
    if p_query is null or length(p_query) > 200 or p_page is null
        or p_page not between 1 and 1000000 then
        raise exception 'Invalid candidate directory filters' using errcode = '22023';
    end if;
    return (
        with filtered as materialized (
            select c.id, c.full_name, c.created_at
            from app.candidates c
            where c.organization_id = v_org and c.lifecycle = 'active'
                and (p_query = '' or strpos(lower(coalesce(c.full_name, '') || ' ' ||
                    coalesce(app.candidate_contact_v1(c, 'email'), '')), lower(p_query)) > 0)
        ), metadata as (
            select count(*) as total,
                least(p_page, greatest(1, (count(*) + 49) / 50))::integer as page
            from filtered
        ), paged as (
            select * from filtered order by created_at desc, id desc
            limit 50 offset (select (page - 1) * 50 from metadata)
        )
        select jsonb_build_object(
            'total', m.total, 'page', m.page, 'pageSize', 50,
            'rows', coalesce((select jsonb_agg(jsonb_build_object(
                'candidateId', c.id, 'fullName', c.full_name,
                'email', app.candidate_contact_v1(c, 'email'),
                'headline', c.headline, 'location', c.location,
                'ownerName', ou.display_name,
                'applicationCount', (select count(*) from app.applications a
                    where a.organization_id = v_org and a.candidate_id = c.id),
                'hasCv', c.current_document_id is not null, 'createdAt', c.created_at
            ) order by c.created_at desc, c.id desc)
                from paged p join app.candidates c on c.id = p.id and c.organization_id = v_org
                left join app.organization_memberships om
                    on om.id = c.owner_membership_id and om.organization_id = v_org
                left join app.users ou on ou.id = om.user_id), '[]'::jsonb),
            'profileOptions', app.get_candidate_profile_options_v1()
        ) from metadata m
    );
end
$$;
revoke all on function app.list_candidate_profile_directory_v1(text, integer) from public;
grant execute on function app.list_candidate_profile_directory_v1(text, integer) to app_staff;
grant create on schema app to app_executor;
reset role;
alter function app.list_candidate_profile_directory_v1(text, integer) owner to app_executor;
set local role app_owner;
revoke create on schema app from app_executor;
commit;
