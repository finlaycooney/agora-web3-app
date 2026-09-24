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

create function app.safe_url_valid_v1(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select p_value is not null
        and length(p_value) <= 2048
        and p_value ~ '^https?://[^/?#@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'
$$;

create function app.normalize_url_input_v1(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_value text;
begin
    if p_value is null then
        return null;
    end if;
    v_value := btrim(p_value);
    if length(v_value) < 1 or length(v_value) > 2048 then
        return null;
    end if;
    if v_value like '//%' then
        return 'https:' || v_value;
    end if;
    if v_value !~ '^[A-Za-z][A-Za-z0-9+.-]*:' then
        return 'https://' || v_value;
    end if;
    return v_value;
end
$$;

create function app.job_doc_mark_ok_v1(p_mark jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_attrs jsonb;
begin
    if p_mark is null or jsonb_typeof(p_mark) <> 'object' then
        return false;
    end if;
    if p_mark ->> 'type' in ('bold', 'italic', 'underline', 'strike') then
        return not exists (
            select 1 from jsonb_object_keys(p_mark) k where k <> 'type'
        );
    end if;
    if p_mark ->> 'type' = 'link' then
        if exists (
            select 1 from jsonb_object_keys(p_mark) k where k not in ('type', 'attrs')
        ) then
            return false;
        end if;
        v_attrs := p_mark -> 'attrs';
        if v_attrs is null or jsonb_typeof(v_attrs) <> 'object' then
            return false;
        end if;
        if exists (
            select 1 from jsonb_object_keys(v_attrs) k where k <> 'href'
        ) then
            return false;
        end if;
        return jsonb_typeof(v_attrs -> 'href') = 'string'
            and app.safe_url_valid_v1(v_attrs ->> 'href');
    end if;
    return false;
end
$$;

create function app.job_doc_marks_ok_v1(p_marks jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if p_marks is null then
        return true;
    end if;
    if jsonb_typeof(p_marks) <> 'array' then
        return false;
    end if;
    if exists (
        select m.value ->> 'type' as mark_type
        from jsonb_array_elements(p_marks) m(value)
        group by 1
        having count(*) > 1
    ) then
        return false;
    end if;
    return not exists (
        select 1
        from jsonb_array_elements(p_marks) m(value)
        where not app.job_doc_mark_ok_v1(m.value)
    );
end
$$;

create function app.job_doc_content_ok_v1(
    p_node jsonb,
    p_allowed text[],
    p_allow_empty boolean
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_content jsonb := p_node -> 'content';
begin
    if v_content is null then
        return p_allow_empty;
    end if;
    if jsonb_typeof(v_content) <> 'array' then
        return false;
    end if;
    if jsonb_array_length(v_content) = 0 then
        return p_allow_empty;
    end if;
    return not exists (
        select 1
        from jsonb_array_elements(v_content) e(value)
        where jsonb_typeof(e.value) <> 'object'
            or not (e.value ->> 'type' = any (p_allowed))
    );
end
$$;

create function app.job_doc_node_ok_v1(p_node jsonb, p_parent text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_attrs jsonb;
    v_start jsonb;
begin
    if p_node is null or jsonb_typeof(p_node) <> 'object' then
        return false;
    end if;
    case p_node ->> 'type'
    when 'doc' then
        return p_parent is null
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content')
            )
            and app.job_doc_content_ok_v1(
                p_node,
                array['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote'],
                false
            );
    when 'paragraph' then
        return p_parent in ('doc', 'listItem', 'blockquote')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content')
            )
            and app.job_doc_content_ok_v1(p_node, array['text', 'hardBreak'], true);
    when 'heading' then
        v_attrs := p_node -> 'attrs';
        return p_parent in ('doc', 'listItem', 'blockquote')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content', 'attrs')
            )
            and v_attrs is not null
            and jsonb_typeof(v_attrs) = 'object'
            and not exists (
                select 1 from jsonb_object_keys(v_attrs) k where k <> 'level'
            )
            and (v_attrs -> 'level') in ('2'::jsonb, '3'::jsonb)
            and app.job_doc_content_ok_v1(p_node, array['text', 'hardBreak'], true);
    when 'bulletList' then
        return p_parent in ('doc', 'listItem', 'blockquote')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content')
            )
            and app.job_doc_content_ok_v1(p_node, array['listItem'], false);
    when 'orderedList' then
        if not (p_parent in ('doc', 'listItem', 'blockquote')) then
            return false;
        end if;
        if exists (
            select 1 from jsonb_object_keys(p_node) k
            where k not in ('type', 'content', 'attrs')
        ) then
            return false;
        end if;
        v_attrs := p_node -> 'attrs';
        if v_attrs is not null then
            if jsonb_typeof(v_attrs) <> 'object'
                or exists (
                    select 1 from jsonb_object_keys(v_attrs) k where k <> 'start'
                ) then
                return false;
            end if;
            v_start := v_attrs -> 'start';
            if v_start is null or jsonb_typeof(v_start) <> 'number'
                or (v_start #>> '{}')::numeric <> floor((v_start #>> '{}')::numeric)
                or (v_start #>> '{}')::numeric < 1
                or (v_start #>> '{}')::numeric > 10000 then
                return false;
            end if;
        end if;
        return app.job_doc_content_ok_v1(p_node, array['listItem'], false);
    when 'listItem' then
        return p_parent in ('bulletList', 'orderedList')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content')
            )
            and app.job_doc_content_ok_v1(
                p_node,
                array['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote'],
                false
            )
            and (p_node -> 'content' -> 0) ->> 'type' = 'paragraph';
    when 'blockquote' then
        return p_parent in ('doc', 'listItem')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'content')
            )
            and app.job_doc_content_ok_v1(
                p_node,
                array['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote'],
                false
            );
    when 'text' then
        return p_parent in ('paragraph', 'heading')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k
                where k not in ('type', 'text', 'marks')
            )
            and jsonb_typeof(p_node -> 'text') = 'string'
            and length(p_node ->> 'text') > 0
            and app.job_doc_marks_ok_v1(p_node -> 'marks');
    when 'hardBreak' then
        return p_parent in ('paragraph', 'heading')
            and not exists (
                select 1 from jsonb_object_keys(p_node) k where k <> 'type'
            );
    else
        return false;
    end case;
end
$$;

create function app.job_document_valid_v1(p_document jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    with recursive walk(depth, node, parent_type) as (
        select 0, p_document, null::text
        union all
        select w.depth + 1, e.value, w.node ->> 'type'
        from walk w
        join lateral jsonb_array_elements(
            case
                when jsonb_typeof(w.node) = 'object'
                    and jsonb_typeof(w.node -> 'content') = 'array'
                then w.node -> 'content'
                else '[]'::jsonb
            end
        ) as e(value) on w.depth < 12
    ),
    stats as (
        select count(*) as total,
            coalesce(bool_or(
                w.depth = 12
                and jsonb_typeof(w.node) = 'object'
                and jsonb_typeof(w.node -> 'content') = 'array'
                and jsonb_array_length(w.node -> 'content') > 0
            ), false) as overflow,
            coalesce(bool_and(
                app.job_doc_node_ok_v1(w.node, w.parent_type)
            ), false) as all_ok
        from walk w
    )
    select p_document is not null
        and jsonb_typeof(p_document) = 'object'
        and octet_length(p_document::text) <= 65536
        and s.total <= 2048
        and not s.overflow
        and s.all_ok
    from stats s
$$;

create function app.job_document_text_v1(p_node jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_type text;
    v_parts text[] := '{}';
    v_child jsonb;
begin
    if p_node is null or jsonb_typeof(p_node) <> 'object' then
        return '';
    end if;
    v_type := p_node ->> 'type';
    if v_type = 'text' then
        return coalesce(p_node ->> 'text', '');
    end if;
    if v_type = 'hardBreak' then
        return E'\n';
    end if;
    if jsonb_typeof(p_node -> 'content') <> 'array' then
        return '';
    end if;
    for v_child in select value from jsonb_array_elements(p_node -> 'content') loop
        v_parts := v_parts || app.job_document_text_v1(v_child);
    end loop;
    if v_type in ('paragraph', 'heading') then
        return array_to_string(v_parts, '');
    end if;
    return array_to_string(v_parts, E'\n');
end
$$;

create function app.location_label_valid_v1(p_label text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select p_label is not null
        and length(btrim(p_label)) between 1 and 120
        and (
            p_label = any (array[
                'Worldwide', 'Africa', 'ANZ', 'APAC', 'Asia', 'Asia-Pacific',
                'Benelux', 'DACH', 'EMEA', 'EU', 'Europe', 'European Union',
                'LATAM', 'Latin America', 'Middle East', 'Nordics',
                'North America', 'Oceania', 'South America', 'UK & Ireland',
                'United Kingdom', 'United States', 'US & Canada',
                'Amsterdam', 'Austin', 'Bangalore', 'Barcelona', 'Bengaluru',
                'Berlin', 'Birmingham', 'Boston', 'Bristol', 'Brussels',
                'Cambridge', 'Cardiff', 'Chicago', 'Copenhagen', 'Delhi',
                'Dubai', 'Dublin', 'Edinburgh', 'Glasgow', 'Hong Kong',
                'Leeds', 'Lisbon', 'London', 'Los Angeles', 'Madrid',
                'Manchester', 'Melbourne', 'Milan', 'Munich', 'New York',
                'Oxford', 'Paris', 'Prague', 'San Francisco', 'Seattle',
                'Singapore', 'Stockholm', 'Sydney', 'Tel Aviv', 'Tokyo',
                'Toronto', 'Vancouver', 'Vienna', 'Warsaw', 'Zurich',
                'Afghanistan', 'Aland Islands', 'Åland Islands', 'Albania',
                'Algeria', 'American Samoa', 'Andorra', 'Angola', 'Anguilla',
                'Antarctica', 'Antigua and Barbuda', 'Argentina', 'Armenia',
                'Aruba', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas',
                'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
                'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
                'Bonaire, Sint Eustatius and Saba', 'Bosnia and Herzegovina',
                'Botswana', 'Bouvet Island', 'Brazil',
                'British Indian Ocean Territory', 'Brunei Darussalam',
                'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
                'Canada', 'Cape Verde', 'Cayman Islands',
                'Central African Republic', 'Chad', 'Chile', 'China',
                'Christmas Island', 'Cocos (Keeling) Islands', 'Colombia',
                'Comoros', 'Congo', 'Cook Islands', 'Costa Rica',
                'Cote d''Ivoire', 'Côte d''Ivoire', 'Croatia', 'Cuba',
                'Curaçao', 'Cyprus', 'Czech Republic', 'Czechia',
                'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
                'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
                'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia',
                'Eswatini', 'Ethiopia', 'Falkland Islands (Malvinas)',
                'Faroe Islands', 'Fiji', 'Finland', 'France', 'French Guiana',
                'French Polynesia', 'French Southern Territories', 'Gabon',
                'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar',
                'Great Britain', 'Greece', 'Greenland', 'Grenada',
                'Guadeloupe', 'Guam', 'Guatemala', 'Guernsey', 'Guinea',
                'Guinea-Bissau', 'Guyana', 'Haiti',
                'Heard Island and McDonald Islands',
                'Holy See (Vatican City State)', 'Honduras', 'Hong Kong',
                'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
                'Ireland', 'Islamic Republic of Iran', 'Isle of Man', 'Israel',
                'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jersey', 'Jordan',
                'Kazakhstan', 'Kenya', 'Kiribati', 'Korea, Republic of',
                'Kosovo', 'Kuwait', 'Kyrgyzstan',
                'Lao People''s Democratic Republic', 'Latvia', 'Lebanon',
                'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
                'Luxembourg', 'Macao', 'Madagascar', 'Malawi', 'Malaysia',
                'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Martinique',
                'Mauritania', 'Mauritius', 'Mayotte', 'Mexico',
                'Micronesia, Federated States of', 'Moldova, Republic of',
                'Monaco', 'Mongolia', 'Montenegro', 'Montserrat', 'Morocco',
                'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
                'Netherlands', 'Netherlands (Kingdom of the)', 'New Caledonia',
                'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue',
                'Norfolk Island', 'North Korea', 'North Macedonia',
                'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan',
                'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
                'People''s Republic of China', 'Peru', 'Philippines',
                'Pitcairn', 'Pitcairn Islands', 'Poland', 'Portugal',
                'Puerto Rico', 'Qatar', 'Republic of Korea',
                'Republic of the Congo', 'Republic of The Gambia', 'Reunion',
                'Romania', 'Russia', 'Russian Federation', 'Rwanda',
                'Saint Barthélemy', 'Saint Helena', 'Saint Kitts and Nevis',
                'Saint Lucia', 'Saint Martin (French part)',
                'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines',
                'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia',
                'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
                'Sint Maarten (Dutch part)', 'Slovakia', 'Slovenia',
                'Solomon Islands', 'Somalia', 'South Africa',
                'South Georgia and the South Sandwich Islands', 'South Korea',
                'South Sudan', 'Spain', 'Sri Lanka', 'State of Palestine',
                'Sudan', 'Suriname', 'Svalbard and Jan Mayen', 'Sweden',
                'Switzerland', 'Syrian Arab Republic', 'Taiwan',
                'Taiwan, Province of China', 'Tajikistan', 'Tanzania',
                'Thailand', 'The Gambia', 'The Netherlands',
                'The Republic of North Macedonia', 'Timor-Leste', 'Togo',
                'Tokelau', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
                'Turkey', 'Türkiye', 'Turkmenistan',
                'Turks and Caicos Islands', 'Tuvalu', 'U.S.', 'U.S.A.', 'UAE',
                'Uganda', 'UK', 'Ukraine', 'United Arab Emirates',
                'United Republic of Tanzania',
                'United States Minor Outlying Islands',
                'United States of America', 'Uruguay', 'US', 'USA',
                'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam',
                'Virgin Islands, British', 'Virgin Islands, U.S.',
                'Wallis and Futuna', 'Western Sahara', 'Yemen', 'Zambia',
                'Zimbabwe'
            ])
            or p_label = any (array[
                'Abidjan', 'Accra', 'Adak', 'Addis Ababa', 'Adelaide',
                'Aden', 'Algiers', 'Almaty', 'Amman', 'Amsterdam',
                'Anadyr', 'Anchorage', 'Andorra', 'Anguilla', 'Antananarivo',
                'Antigua', 'Apia', 'Aqtau', 'Aqtobe', 'Araguaina',
                'Aruba', 'Ashgabat', 'Asmera', 'Astrakhan', 'Asuncion',
                'Athens', 'Atyrau', 'Auckland', 'Azores', 'Baghdad',
                'Bahia', 'Bahia Banderas', 'Bahrain', 'Baku', 'Bamako',
                'Bangkok', 'Bangui', 'Banjul', 'Barbados', 'Barnaul',
                'Beirut', 'Belem', 'Belgrade', 'Belize', 'Berlin',
                'Bermuda', 'Beulah', 'Bishkek', 'Bissau', 'Blanc-Sablon',
                'Blantyre', 'Boa Vista', 'Bogota', 'Boise', 'Bougainville',
                'Bratislava', 'Brazzaville', 'Brisbane', 'Broken Hill', 'Brunei',
                'Brussels', 'Bucharest', 'Budapest', 'Buenos Aires', 'Bujumbura',
                'Busingen', 'Cairo', 'Calcutta', 'Cambridge Bay', 'Campo Grande',
                'Canary', 'Cancun', 'Cape Verde', 'Caracas', 'Casablanca',
                'Casey', 'Catamarca', 'Cayenne', 'Cayman', 'Center',
                'Ceuta', 'Chagos', 'Chatham', 'Chicago', 'Chihuahua',
                'Chisinau', 'Chita', 'Christmas', 'Ciudad Juarez', 'Cocos',
                'Colombo', 'Comoro', 'Conakry', 'Copenhagen', 'Coral Harbour',
                'Cordoba', 'Costa Rica', 'Coyhaique', 'Creston', 'Cuiaba',
                'Curacao', 'Dakar', 'Damascus', 'Danmarkshavn', 'Dar es Salaam',
                'Darwin', 'Davis', 'Dawson', 'Dawson Creek', 'Denver',
                'Detroit', 'Dhaka', 'Dili', 'Djibouti', 'Dominica',
                'Douala', 'Dubai', 'Dublin', 'DumontDUrville', 'Dushanbe',
                'Easter', 'Edmonton', 'Efate', 'Eirunepe', 'El Aaiun',
                'El Salvador', 'Enderbury', 'Eucla', 'Faeroe', 'Fakaofo',
                'Famagusta', 'Fiji', 'Fort Nelson', 'Fortaleza', 'Freetown',
                'Funafuti', 'Gaborone', 'Galapagos', 'Gambier', 'Gaza',
                'Gibraltar', 'Glace Bay', 'Godthab', 'Goose Bay', 'Grand Turk',
                'Grenada', 'Guadalcanal', 'Guadeloupe', 'Guam', 'Guatemala',
                'Guayaquil', 'Guernsey', 'Guyana', 'Halifax', 'Harare',
                'Havana', 'Hebron', 'Helsinki', 'Hermosillo', 'Hobart',
                'Hong Kong', 'Honolulu', 'Hovd', 'Indianapolis', 'Inuvik',
                'Iqaluit', 'Irkutsk', 'Isle of Man', 'Istanbul', 'Jakarta',
                'Jamaica', 'Jayapura', 'Jersey', 'Jerusalem', 'Johannesburg',
                'Juba', 'Jujuy', 'Juneau', 'Kabul', 'Kaliningrad',
                'Kamchatka', 'Kampala', 'Karachi', 'Katmandu', 'Kerguelen',
                'Khandyga', 'Khartoum', 'Kiev', 'Kigali', 'Kinshasa',
                'Kiritimati', 'Kirov', 'Knox', 'Kosrae', 'Kralendijk',
                'Krasnoyarsk', 'Kuala Lumpur', 'Kuching', 'Kuwait', 'Kwajalein',
                'La Paz', 'La Rioja', 'Lagos', 'Libreville', 'Lima',
                'Lindeman', 'Lisbon', 'Ljubljana', 'Lome', 'London',
                'Longyearbyen', 'Lord Howe', 'Los Angeles', 'Louisville', 'Lower Princes',
                'Luanda', 'Lubumbashi', 'Lusaka', 'Luxembourg', 'Macau',
                'Maceio', 'Macquarie', 'Madeira', 'Madrid', 'Magadan',
                'Mahe', 'Majuro', 'Makassar', 'Malabo', 'Maldives',
                'Malta', 'Managua', 'Manaus', 'Manila', 'Maputo',
                'Marengo', 'Mariehamn', 'Marigot', 'Marquesas', 'Martinique',
                'Maseru', 'Matamoros', 'Mauritius', 'Mawson', 'Mayotte',
                'Mazatlan', 'Mbabane', 'McMurdo', 'Melbourne', 'Mendoza',
                'Menominee', 'Merida', 'Metlakatla', 'Mexico City', 'Midway',
                'Minsk', 'Miquelon', 'Mogadishu', 'Monaco', 'Moncton',
                'Monrovia', 'Monterrey', 'Montevideo', 'Monticello', 'Montserrat',
                'Moscow', 'Muscat', 'Nairobi', 'Nassau', 'Nauru',
                'Ndjamena', 'New Salem', 'New York', 'Niamey', 'Nicosia',
                'Niue', 'Nome', 'Norfolk', 'Noronha', 'Nouakchott',
                'Noumea', 'Novokuznetsk', 'Novosibirsk', 'Ojinaga', 'Omsk',
                'Oral', 'Oslo', 'Ouagadougou', 'Pago Pago', 'Palau',
                'Palmer', 'Panama', 'Paramaribo', 'Paris', 'Perth',
                'Petersburg', 'Phnom Penh', 'Phoenix', 'Pitcairn', 'Podgorica',
                'Ponape', 'Pontianak', 'Port Moresby', 'Port of Spain', 'Port-au-Prince',
                'Porto Velho', 'Porto-Novo', 'Prague', 'Puerto Rico', 'Punta Arenas',
                'Pyongyang', 'Qatar', 'Qostanay', 'Qyzylorda', 'Rangoon',
                'Rankin Inlet', 'Rarotonga', 'Recife', 'Regina', 'Resolute',
                'Reunion', 'Reykjavik', 'Riga', 'Rio Branco', 'Rio Gallegos',
                'Riyadh', 'Rome', 'Rothera', 'Saigon', 'Saipan',
                'Sakhalin', 'Salta', 'Samara', 'Samarkand', 'San Juan',
                'San Luis', 'San Marino', 'Santarem', 'Santiago', 'Santo Domingo',
                'Sao Paulo', 'Sao Tome', 'Sarajevo', 'Saratov', 'Scoresbysund',
                'Seoul', 'Shanghai', 'Simferopol', 'Singapore', 'Sitka',
                'Skopje', 'Sofia', 'South Georgia', 'Srednekolymsk', 'St Barthelemy',
                'St Helena', 'St Johns', 'St Kitts', 'St Lucia', 'St Thomas',
                'St Vincent', 'Stanley', 'Stockholm', 'Swift Current', 'Sydney',
                'Syowa', 'Tahiti', 'Taipei', 'Tallinn', 'Tarawa',
                'Tashkent', 'Tbilisi', 'Tegucigalpa', 'Tehran', 'Tell City',
                'Thimphu', 'Thule', 'Tijuana', 'Tirane', 'Tokyo',
                'Tomsk', 'Tongatapu', 'Toronto', 'Tortola', 'Tripoli',
                'Troll', 'Truk', 'Tucuman', 'Tunis', 'Ulaanbaatar',
                'Ulyanovsk', 'Urumqi', 'Ushuaia', 'Ust-Nera', 'Vaduz',
                'Vancouver', 'Vatican', 'Vevay', 'Vienna', 'Vientiane',
                'Vilnius', 'Vincennes', 'Vladivostok', 'Volgograd', 'Vostok',
                'Wake', 'Wallis', 'Warsaw', 'Whitehorse', 'Winamac',
                'Windhoek', 'Winnipeg', 'Yakutat', 'Yakutsk', 'Yekaterinburg',
                'Yerevan', 'Zagreb', 'Zurich'
            ])
        )
$$;

create function app.job_label_array_valid_v1(p_labels text[])
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select p_labels is not null
        and cardinality(p_labels) <= 20
        and not exists (
            select 1 from unnest(p_labels) e
            where not app.location_label_valid_v1(e)
        )
        and (select count(distinct e) from unnest(p_labels) e) = cardinality(p_labels)
$$;

create function app.job_bonuses_valid_v1(p_bonuses jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_entry jsonb;
    v_types text[] := '{}';
begin
    if p_bonuses is null or jsonb_typeof(p_bonuses) <> 'array'
        or jsonb_array_length(p_bonuses) > 5 then
        return false;
    end if;
    for v_entry in select value from jsonb_array_elements(p_bonuses) loop
        if jsonb_typeof(v_entry) <> 'object'
            or exists (
                select 1 from jsonb_object_keys(v_entry) k
                where k not in ('type', 'details')
            )
            or jsonb_typeof(v_entry -> 'type') <> 'string'
            or (v_entry ->> 'type') not in
                ('cash', 'equity', 'options', 'stock', 'token', 'other')
            or jsonb_typeof(v_entry -> 'details') <> 'string'
            or length(btrim(v_entry ->> 'details')) < 1
            or length(v_entry ->> 'details') > 2000
            or (v_entry ->> 'type') = any (v_types) then
            return false;
        end if;
        v_types := v_types || (v_entry ->> 'type');
    end loop;
    return true;
end
$$;

create function app.social_platform_url_valid_v1(p_platform text, p_url text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    with parsed as (
        select split_part(
            substring(lower(app.normalize_url_input_v1(p_url)) from '^https?://([^/?#]+)'),
            ':', 1
        ) as host
    )
    select case p_platform
        when 'linkedin' then
            host = 'linkedin.com' or host like '%.linkedin.com'
        when 'github' then
            host = 'github.com' or host like '%.github.com'
        when 'x' then
            host in ('x.com', 'twitter.com')
                or host like '%.x.com' or host like '%.twitter.com'
        when 'other' then true
        else false
    end
    from parsed
$$;

create function app.client_social_links_valid_v1(p_links jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_entry jsonb;
    v_urls text[] := '{}';
begin
    if p_links is null or jsonb_typeof(p_links) <> 'array'
        or jsonb_array_length(p_links) > 8 then
        return false;
    end if;
    for v_entry in select value from jsonb_array_elements(p_links) loop
        if jsonb_typeof(v_entry) <> 'object'
            or exists (
                select 1 from jsonb_object_keys(v_entry) k
                where k not in ('platform', 'url')
            )
            or jsonb_typeof(v_entry -> 'platform') <> 'string'
            or (v_entry ->> 'platform') not in ('linkedin', 'x', 'github', 'other')
            or jsonb_typeof(v_entry -> 'url') <> 'string'
            or not app.safe_url_valid_v1(v_entry ->> 'url')
            or not app.social_platform_url_valid_v1(
                v_entry ->> 'platform', v_entry ->> 'url'
            )
            or lower(v_entry ->> 'url') = any (v_urls) then
            return false;
        end if;
        v_urls := v_urls || lower(v_entry ->> 'url');
    end loop;
    return true;
end
$$;

create function app.client_draft_fields_sanitized_v1(p_fields jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_entry jsonb;
    v_links jsonb := '[]'::jsonb;
    v_url text;
    v_urls text[] := '{}';
    v_contact_name text;
    v_contact_email text;
    v_telegram text;
    v_website text;
    v_description text;
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        return null;
    end if;

    if jsonb_typeof(p_fields -> 'contactName') = 'string'
        and length(btrim(p_fields ->> 'contactName')) between 1 and 256 then
        v_contact_name := btrim(p_fields ->> 'contactName');
    end if;
    if jsonb_typeof(p_fields -> 'contactEmail') = 'string'
        and length(btrim(p_fields ->> 'contactEmail')) <= 254
        and btrim(p_fields ->> 'contactEmail') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        v_contact_email := btrim(p_fields ->> 'contactEmail');
    end if;
    if jsonb_typeof(p_fields -> 'telegramUsername') = 'string' then
        v_telegram := regexp_replace(btrim(p_fields ->> 'telegramUsername'), '^@', '');
        if v_telegram !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then
            v_telegram := null;
        end if;
    end if;
    if jsonb_typeof(p_fields -> 'website') = 'string' then
        v_website := app.normalize_url_input_v1(p_fields ->> 'website');
        if not app.safe_url_valid_v1(v_website) then
            v_website := null;
        end if;
    end if;
    if jsonb_typeof(p_fields -> 'socialLinks') = 'array' then
        for v_entry in select value from jsonb_array_elements(p_fields -> 'socialLinks') loop
            exit when jsonb_array_length(v_links) >= 8;
            if jsonb_typeof(v_entry) = 'object'
                and not exists (
                    select 1 from jsonb_object_keys(v_entry) k
                    where k not in ('platform', 'url')
                )
                and jsonb_typeof(v_entry -> 'platform') = 'string'
                and (v_entry ->> 'platform') in ('linkedin', 'x', 'github', 'other')
                and jsonb_typeof(v_entry -> 'url') = 'string' then
                v_url := app.normalize_url_input_v1(v_entry ->> 'url');
                if v_url is not null
                    and app.safe_url_valid_v1(v_url)
                    and app.social_platform_url_valid_v1(v_entry ->> 'platform', v_url)
                    and not (lower(v_url) = any (v_urls)) then
                    v_urls := v_urls || lower(v_url);
                    v_links := v_links || jsonb_build_array(jsonb_build_object(
                        'platform', v_entry ->> 'platform',
                        'url', v_url
                    ));
                end if;
            end if;
        end loop;
    end if;
    if jsonb_typeof(p_fields -> 'anonymousDescription') = 'string'
        and length(btrim(p_fields ->> 'anonymousDescription')) between 1 and 4000 then
        v_description := btrim(p_fields ->> 'anonymousDescription');
    end if;

    return jsonb_build_object(
        'name', p_fields -> 'name',
        'contactName', v_contact_name,
        'contactEmail', v_contact_email,
        'telegramUsername', v_telegram,
        'website', v_website,
        'socialLinks', v_links,
        'isStealth', case
            when jsonb_typeof(p_fields -> 'isStealth') = 'boolean'
                then p_fields -> 'isStealth'
            else 'null'::jsonb
        end,
        'anonymousDescription', v_description
    );
end
$$;

create function app.client_fields_valid_v1(p_fields jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_keys text[];
    v_all constant text[] := array[
        'name', 'contactName', 'contactEmail', 'telegramUsername', 'website',
        'socialLinks', 'isStealth', 'anonymousDescription'
    ];
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        return false;
    end if;
    select coalesce(array_agg(k), '{}'::text[]) into v_keys
    from jsonb_object_keys(p_fields) k;
    if not (v_keys @> v_all and v_keys <@ v_all) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'name') <> 'string'
        or length(btrim(p_fields ->> 'name')) < 1
        or length(p_fields ->> 'name') > 256 then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'contactName') <> 'string'
        or length(btrim(p_fields ->> 'contactName')) < 1
        or length(p_fields ->> 'contactName') > 256 then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'contactEmail') <> 'string'
        or length(p_fields ->> 'contactEmail') > 254
        or (p_fields ->> 'contactEmail') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'telegramUsername') <> 'null'
        and (jsonb_typeof(p_fields -> 'telegramUsername') <> 'string'
            or (p_fields ->> 'telegramUsername') !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'website') <> 'null'
        and (jsonb_typeof(p_fields -> 'website') <> 'string'
            or not app.safe_url_valid_v1(p_fields ->> 'website')) then
        return false;
    end if;
    if not app.client_social_links_valid_v1(p_fields -> 'socialLinks') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'isStealth') <> 'boolean' then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'anonymousDescription') <> 'null'
        and (jsonb_typeof(p_fields -> 'anonymousDescription') <> 'string'
            or length(btrim(p_fields ->> 'anonymousDescription')) < 1
            or length(p_fields ->> 'anonymousDescription') > 4000) then
        return false;
    end if;
    if (p_fields -> 'isStealth')::boolean
        and (jsonb_typeof(p_fields -> 'anonymousDescription') <> 'string'
            or length(btrim(p_fields ->> 'anonymousDescription')) < 1) then
        return false;
    end if;
    return true;
end
$$;

create function app.client_draft_fields_valid_v1(p_fields jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_keys text[];
    v_all constant text[] := array[
        'name', 'contactName', 'contactEmail', 'telegramUsername', 'website',
        'socialLinks', 'isStealth', 'anonymousDescription'
    ];
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        return false;
    end if;
    select coalesce(array_agg(k), '{}'::text[]) into v_keys
    from jsonb_object_keys(p_fields) k;
    if not (v_keys @> v_all and v_keys <@ v_all) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'name') <> 'string'
        or length(btrim(p_fields ->> 'name')) < 1
        or length(p_fields ->> 'name') > 256 then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'contactName') <> 'null'
        and (jsonb_typeof(p_fields -> 'contactName') <> 'string'
            or length(btrim(p_fields ->> 'contactName')) < 1
            or length(p_fields ->> 'contactName') > 256) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'contactEmail') <> 'null'
        and (jsonb_typeof(p_fields -> 'contactEmail') <> 'string'
            or length(p_fields ->> 'contactEmail') > 254
            or (p_fields ->> 'contactEmail') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'telegramUsername') <> 'null'
        and (jsonb_typeof(p_fields -> 'telegramUsername') <> 'string'
            or (p_fields ->> 'telegramUsername') !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'website') <> 'null'
        and (jsonb_typeof(p_fields -> 'website') <> 'string'
            or not app.safe_url_valid_v1(p_fields ->> 'website')) then
        return false;
    end if;
    if not app.client_social_links_valid_v1(p_fields -> 'socialLinks') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'isStealth') not in ('null', 'boolean') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'anonymousDescription') <> 'null'
        and (jsonb_typeof(p_fields -> 'anonymousDescription') <> 'string'
            or length(btrim(p_fields ->> 'anonymousDescription')) < 1
            or length(p_fields ->> 'anonymousDescription') > 4000) then
        return false;
    end if;
    return true;
end
$$;

create function app.job_fields_valid_v1(p_fields jsonb, p_ready boolean)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_keys text[];
    v_all constant text[] := array[
        'title', 'employmentType', 'workplaceMode', 'locations', 'remoteRegions',
        'compensationMin', 'compensationMax', 'currency', 'payPeriod', 'bonuses',
        'descriptionDocument'
    ];
    v_min numeric(14, 2);
    v_max numeric(14, 2);
    v_mode text;
    v_locations integer;
    v_regions integer;
    v_plain text;
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        return false;
    end if;
    select coalesce(array_agg(k), '{}'::text[]) into v_keys
    from jsonb_object_keys(p_fields) k;
    if not (v_keys @> v_all and v_keys <@ v_all) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'title') <> 'string'
        or length(btrim(p_fields ->> 'title')) < 1
        or length(p_fields ->> 'title') > 200 then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'employmentType') <> 'null'
        and (jsonb_typeof(p_fields -> 'employmentType') <> 'string'
            or (p_fields ->> 'employmentType') not in
                ('full_time', 'part_time', 'contract', 'internship')) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'workplaceMode') <> 'null'
        and (jsonb_typeof(p_fields -> 'workplaceMode') <> 'string'
            or (p_fields ->> 'workplaceMode') not in ('onsite', 'hybrid', 'remote')) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'locations') <> 'array'
        or exists (
            select 1 from jsonb_array_elements(p_fields -> 'locations') e(value)
            where jsonb_typeof(e.value) <> 'string'
        )
        or not app.job_label_array_valid_v1(
            array(select e.value #>> '{}'
                  from jsonb_array_elements(p_fields -> 'locations') e(value))
        ) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'remoteRegions') <> 'array'
        or exists (
            select 1 from jsonb_array_elements(p_fields -> 'remoteRegions') e(value)
            where jsonb_typeof(e.value) <> 'string'
        )
        or not app.job_label_array_valid_v1(
            array(select e.value #>> '{}'
                  from jsonb_array_elements(p_fields -> 'remoteRegions') e(value))
        ) then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'compensationMin') not in ('null', 'string')
        or jsonb_typeof(p_fields -> 'compensationMax') not in ('null', 'string')
        or (jsonb_typeof(p_fields -> 'compensationMin') = 'string'
            and (p_fields ->> 'compensationMin') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$')
        or (jsonb_typeof(p_fields -> 'compensationMax') = 'string'
            and (p_fields ->> 'compensationMax') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'compensationMin') = 'string'
        and jsonb_typeof(p_fields -> 'compensationMax') = 'string' then
        v_min := (p_fields ->> 'compensationMin')::numeric;
        v_max := (p_fields ->> 'compensationMax')::numeric;
        if v_max < v_min then
            return false;
        end if;
    end if;
    if jsonb_typeof(p_fields -> 'currency') <> 'null'
        and (jsonb_typeof(p_fields -> 'currency') <> 'string'
            or (p_fields ->> 'currency') !~ '^[A-Z]{3}$') then
        return false;
    end if;
    if jsonb_typeof(p_fields -> 'payPeriod') <> 'null'
        and (jsonb_typeof(p_fields -> 'payPeriod') <> 'string'
            or (p_fields ->> 'payPeriod') not in ('year', 'month', 'day', 'hour')) then
        return false;
    end if;
    if not app.job_bonuses_valid_v1(p_fields -> 'bonuses') then
        return false;
    end if;
    if not app.job_document_valid_v1(p_fields -> 'descriptionDocument') then
        return false;
    end if;
    if coalesce(p_ready, false) then
        if jsonb_typeof(p_fields -> 'employmentType') <> 'string'
            or jsonb_typeof(p_fields -> 'workplaceMode') <> 'string'
            or jsonb_typeof(p_fields -> 'compensationMin') <> 'string'
            or jsonb_typeof(p_fields -> 'compensationMax') <> 'string'
            or jsonb_typeof(p_fields -> 'currency') <> 'string'
            or jsonb_typeof(p_fields -> 'payPeriod') <> 'string' then
            return false;
        end if;
        v_mode := p_fields ->> 'workplaceMode';
        v_locations := jsonb_array_length(p_fields -> 'locations');
        v_regions := jsonb_array_length(p_fields -> 'remoteRegions');
        if v_mode = 'onsite' and (v_locations = 0 or v_regions <> 0) then
            return false;
        end if;
        if v_mode = 'hybrid' and v_locations = 0 then
            return false;
        end if;
        if v_mode = 'remote' and v_regions = 0 then
            return false;
        end if;
        v_plain := app.job_document_text_v1(p_fields -> 'descriptionDocument');
        if length(btrim(v_plain)) < 1 or length(btrim(v_plain)) > 30000 then
            return false;
        end if;
    end if;
    return true;
end
$$;

alter table app.clients
    add column contact_name text,
    add column contact_email text,
    add column telegram_username text,
    add column website text,
    add column social_links jsonb not null default '[]'::jsonb,
    add column is_stealth boolean,
    add column anonymous_description text,
    add column public_profile_version bigint not null default 1
        check (public_profile_version > 0);

alter table app.clients
    drop constraint clients_status_check,
    add constraint clients_status_check
        check (status in ('draft', 'active', 'archived')),
    add constraint clients_contact_name_shape
        check (contact_name is null
            or (length(btrim(contact_name)) > 0 and length(contact_name) <= 256)),
    add constraint clients_contact_email_shape
        check (contact_email is null
            or (length(contact_email) <= 254
                and contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
    add constraint clients_telegram_username_shape
        check (telegram_username is null
            or telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
    add constraint clients_website_shape
        check (website is null or app.safe_url_valid_v1(website)),
    add constraint clients_social_links_shape
        check (app.client_social_links_valid_v1(social_links)),
    add constraint clients_anonymous_description_shape
        check (anonymous_description is null
            or (length(btrim(anonymous_description)) > 0
                and length(anonymous_description) <= 4000)),
    add constraint clients_stealth_brief_check
        check (status <> 'active' or is_stealth is not true
            or (anonymous_description is not null
                and length(btrim(anonymous_description)) > 0));

create function app.client_configured_v1(p_client app.clients)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select p_client.status = 'active'
        and p_client.is_stealth is not null
        and p_client.contact_name is not null
        and btrim(p_client.contact_name) <> ''
        and p_client.contact_email is not null
        and length(p_client.contact_email) <= 254
        and p_client.contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        and (not p_client.is_stealth
            or (p_client.anonymous_description is not null
                and btrim(p_client.anonymous_description) <> ''))
$$;

create table app.job_revisions (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    job_id uuid not null,
    revision_number integer not null check (revision_number > 0),
    title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
    employment_type text check (
        employment_type is null
        or employment_type in ('full_time', 'part_time', 'contract', 'internship')
    ),
    workplace_mode text check (
        workplace_mode is null or workplace_mode in ('onsite', 'hybrid', 'remote')
    ),
    locations text[] not null default '{}'
        check (app.job_label_array_valid_v1(locations)),
    remote_regions text[] not null default '{}'
        check (app.job_label_array_valid_v1(remote_regions)),
    compensation_min numeric(14, 2) check (compensation_min is null or compensation_min >= 0),
    compensation_max numeric(14, 2) check (compensation_max is null or compensation_max >= 0),
    currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
    pay_period text check (pay_period is null or pay_period in ('year', 'month', 'day', 'hour')),
    bonuses jsonb not null default '[]'::jsonb
        check (app.job_bonuses_valid_v1(bonuses)),
    description_document jsonb not null
        check (app.job_document_valid_v1(description_document)),
    description_text text not null,
    status text not null check (status in ('draft', 'published', 'superseded')),
    version bigint not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    published_at timestamptz,
    published_by_membership_id uuid,
    published_client_profile_version bigint check (
        published_client_profile_version is null or published_client_profile_version > 0
    ),
    published_company_name text,
    published_company_description text,
    published_is_stealth boolean,
    unique (organization_id, id),
    unique (organization_id, job_id, id),
    unique (organization_id, job_id, revision_number),
    foreign key (organization_id, job_id)
        references app.jobs (organization_id, id),
    foreign key (organization_id, published_by_membership_id)
        references app.organization_memberships (organization_id, id),
    check (
        compensation_min is null or compensation_max is null
        or compensation_max >= compensation_min
    ),
    check (
        (status = 'draft'
            and published_at is null
            and published_by_membership_id is null
            and published_client_profile_version is null
            and published_company_name is null
            and published_company_description is null
            and published_is_stealth is null)
        or (status in ('published', 'superseded')
            and published_at is not null
            and published_by_membership_id is not null
            and published_client_profile_version is not null
            and published_company_name is not null
            and published_is_stealth is not null
            and (published_is_stealth is not true
                or published_company_description is not null))
    ),
    check (description_text = app.job_document_text_v1(description_document))
);

create unique index job_revisions_single_draft_idx
    on app.job_revisions (organization_id, job_id)
    where status = 'draft';

create unique index job_revisions_single_published_idx
    on app.job_revisions (organization_id, job_id)
    where status = 'published';

create index job_revisions_job_idx
    on app.job_revisions (organization_id, job_id, status, revision_number);

create function app.job_revision_dto_v1(p_revision app.job_revisions)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select jsonb_build_object(
        'id', p_revision.id,
        'jobId', p_revision.job_id,
        'revisionNumber', p_revision.revision_number,
        'title', p_revision.title,
        'employmentType', p_revision.employment_type,
        'workplaceMode', p_revision.workplace_mode,
        'locations', p_revision.locations,
        'remoteRegions', p_revision.remote_regions,
        'compensationMin', p_revision.compensation_min::text,
        'compensationMax', p_revision.compensation_max::text,
        'currency', p_revision.currency,
        'payPeriod', p_revision.pay_period,
        'bonuses', p_revision.bonuses,
        'descriptionDocument', p_revision.description_document,
        'descriptionText', p_revision.description_text,
        'status', p_revision.status,
        'version', p_revision.version::text,
        'createdAt', p_revision.created_at,
        'updatedAt', p_revision.updated_at,
        'publishedAt', p_revision.published_at,
        'publishedByMembershipId', p_revision.published_by_membership_id,
        'publishedClientProfileVersion', p_revision.published_client_profile_version::text,
        'publishedCompanyName', p_revision.published_company_name,
        'publishedCompanyDescription', p_revision.published_company_description,
        'publishedIsStealth', p_revision.published_is_stealth
    )
$$;

alter table app.job_revisions enable row level security;
alter table app.job_revisions force row level security;

alter table app.jobs
    add column published_revision_id uuid;

alter table app.jobs
    add constraint jobs_published_revision_fk
    foreign key (organization_id, id, published_revision_id)
    references app.job_revisions (organization_id, job_id, id)
    deferrable initially immediate;

create index jobs_published_revision_idx
    on app.jobs (organization_id, published_revision_id)
    where published_revision_id is not null;

create table app.recruitment_operation_receipts (
    operation_id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    actor_user_id uuid not null,
    actor_membership_id uuid not null,
    kind text not null check (kind in (
        'client.saved',
        'client.draft.saved',
        'job.draft.created',
        'job.draft.saved',
        'job.revision.started',
        'job.duplicated',
        'job.published'
    )),
    target_id uuid not null,
    request_sha256 bytea not null check (octet_length(request_sha256) = 32),
    result jsonb not null check (
        jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4096
    ),
    created_at timestamptz not null default now(),
    unique (organization_id, operation_id),
    foreign key (organization_id, actor_membership_id, actor_user_id)
        references app.organization_memberships (organization_id, id, user_id)
);

alter table app.recruitment_operation_receipts enable row level security;
alter table app.recruitment_operation_receipts force row level security;

create function app.job_revision_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if old.status <> 'draft' then
        if not (old.status = 'published' and new.status = 'superseded'
            and (to_jsonb(old) - 'status') = (to_jsonb(new) - 'status')) then
            raise exception 'Reviewed job revisions are immutable' using errcode = '23514';
        end if;
    elsif new.id is distinct from old.id
        or new.organization_id is distinct from old.organization_id
        or new.job_id is distinct from old.job_id
        or new.revision_number is distinct from old.revision_number
        or new.created_at is distinct from old.created_at then
        raise exception 'Draft revision identity is immutable' using errcode = '23514';
    end if;
    return new;
end
$$;

create trigger job_revisions_guard
    before update on app.job_revisions
    for each row execute function app.job_revision_guard_v1();

do $$
declare
    v_name text;
begin
    select con.conname into v_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'audit_events' and con.contype = 'c'
        and con.conname = 'audit_events_action_check';
    if v_name is null then
        raise exception 'Expected the named audit action check constraint';
    end if;
    execute format('alter table app.audit_events drop constraint %I', v_name);
end
$$;

alter table app.audit_events
    add constraint audit_events_action_check check (
        (
            action = 'staff.membership.changed'
            and target_type = 'organization_membership'
            and actor_kind = 'staff'
            and details - array[
                'previous_role_id', 'new_role_id', 'previous_status',
                'new_status', 'previous_version', 'new_version'
            ] = '{}'::jsonb
        ) or (
            action = 'staff.role_grants.changed'
            and target_type = 'role'
            and actor_kind = 'staff'
            and details - array[
                'before_keys', 'after_keys', 'previous_version', 'new_version'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'privacy_request'
            and target_id is not null
            and action in (
                'privacy.request.created',
                'privacy.request.verified',
                'privacy.subject.reviewed',
                'privacy.candidate.corrected',
                'privacy.subject.restricted'
            )
            and details - array[
                'subject_id', 'target_id', 'target_kind', 'previous_version',
                'new_version', 'target_previous_version', 'target_new_version',
                'changed_fields', 'lifecycle_generation', 'enforcement_scope'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_id is not null
            and (
                (action in ('client.saved', 'client.draft.saved')
                    and target_type = 'client')
                or (action in (
                        'job.draft.created',
                        'job.draft.saved',
                        'job.revision.started',
                        'job.duplicated',
                        'job.published'
                    ) and target_type = 'job')
            )
            and details - array[
                'previous_version', 'new_version', 'revision_id', 'client_id',
                'public_profile_changed', 'source_job_id', 'source_revision_id',
                'field_names'
            ] = '{}'::jsonb
        )
    );

create function app.recruitment_actor_v1(
    p_required text[],
    p_operation_id uuid,
    p_correlation_id uuid,
    p_write boolean
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_key text;
begin
    if v_org is null or v_actor is null then
        raise exception 'Staff context required' using errcode = '42501';
    end if;
    if coalesce(p_write, false)
        and (p_operation_id is null or p_correlation_id is null) then
        raise exception 'Operation and correlation identifiers required'
            using errcode = '22023';
    end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Read committed required' using errcode = '25001';
    end if;
    if coalesce(p_write, false) then
        perform o.id from app.organizations o where o.id = v_org for update;
    else
        perform o.id from app.organizations o where o.id = v_org for share;
    end if;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if p_required is null then
        raise exception 'Required permission list is missing' using errcode = '22023';
    end if;
    foreach v_key in array p_required loop
        if v_key is null or not app.has_permission_v1(v_key) then
            raise exception 'A required permission is not granted' using errcode = '42501';
        end if;
    end loop;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    return v_member;
end
$$;

create function app.recruitment_receipt_v1(
    p_operation_id uuid,
    p_kind text,
    p_request_sha256 bytea
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_receipt app.recruitment_operation_receipts;
begin
    select r.* into v_receipt
    from app.recruitment_operation_receipts r
    where r.organization_id = v_org and r.operation_id = p_operation_id;
    if not found then
        return null;
    end if;
    if v_receipt.actor_user_id <> v_actor
        or v_receipt.kind <> p_kind
        or v_receipt.request_sha256 <> p_request_sha256 then
        raise exception 'Operation identifier was already used for a different request'
            using errcode = '23505';
    end if;
    return v_receipt.result || jsonb_build_object('replayed', true);
end
$$;

create function app.recruitment_record_v1(
    p_operation_id uuid,
    p_correlation_id uuid,
    p_member uuid,
    p_kind text,
    p_target_id uuid,
    p_digest bytea,
    p_result jsonb,
    p_details jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
begin
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_operation_id, v_org, 'staff', v_actor, p_member, p_kind,
        case when p_kind in ('client.saved', 'client.draft.saved')
            then 'client' else 'job' end,
        p_target_id, p_correlation_id, pg_catalog.clock_timestamp(),
        pg_catalog.jsonb_strip_nulls(coalesce(p_details, '{}'::jsonb))
    );
    insert into app.recruitment_operation_receipts (
        operation_id, organization_id, actor_user_id, actor_membership_id,
        kind, target_id, request_sha256, result
    ) values (
        p_operation_id, v_org, v_actor, p_member, p_kind, p_target_id,
        p_digest, p_result
    );
end
$$;

create function app.job_public_projection_v1(p_revision_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_revision app.job_revisions;
    v_job app.jobs;
    v_client app.clients;
    v_company_name text;
    v_company_description text;
    v_is_stealth boolean;
    v_label text;
    v_escaped text;
    v_host text;
    v_url jsonb;
    v_doc_json text;
begin
    select r.* into v_revision
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id;
    if not found then
        return null;
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = v_revision.job_id;
    if not found then
        return null;
    end if;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = v_job.client_id;
    if not found or v_client.status <> 'active' then
        return null;
    end if;

    if v_revision.status = 'draft' then
        if not app.client_configured_v1(v_client) then
            return null;
        end if;
        if v_client.is_stealth then
            v_company_name := 'Stealth company';
            v_company_description := v_client.anonymous_description;
            v_is_stealth := true;
        else
            v_company_name := v_client.name;
            v_company_description := null;
            v_is_stealth := false;
        end if;
    elsif v_revision.status in ('published', 'superseded') then
        if v_revision.published_company_name is null
            or v_revision.published_is_stealth is null
            or v_revision.published_client_profile_version is null
            or v_client.is_stealth is null
            or v_client.public_profile_version
                is distinct from v_revision.published_client_profile_version then
            return null;
        end if;
        v_company_name := v_revision.published_company_name;
        v_company_description := v_revision.published_company_description;
        v_is_stealth := v_revision.published_is_stealth;
    else
        return null;
    end if;

    if v_is_stealth then
        foreach v_label in array array[v_client.name, v_client.contact_name] loop
            if v_label is not null and length(btrim(v_label)) > 0 then
                if length(v_label) >= 3 then
                    if position(lower(v_label) in lower(v_revision.title)) > 0
                        or position(lower(v_label) in lower(v_revision.description_text)) > 0
                        or position(lower(v_label) in lower(coalesce(v_company_description, ''))) > 0
                    then
                        return null;
                    end if;
                else
                    v_escaped := regexp_replace(
                        lower(v_label), '([.^$*+?()\[\]{}\\|])', '\\\1', 'g');
                    if lower(v_revision.title) ~ ('\m' || v_escaped || '\M')
                        or lower(v_revision.description_text) ~ ('\m' || v_escaped || '\M')
                        or lower(coalesce(v_company_description, '')) ~ ('\m' || v_escaped || '\M')
                    then
                        return null;
                    end if;
                end if;
            end if;
        end loop;
        if v_client.contact_email is not null
            and (position(lower(v_client.contact_email) in lower(v_revision.title)) > 0
                or position(lower(v_client.contact_email) in lower(v_revision.description_text)) > 0
                or position(lower(v_client.contact_email)
                    in lower(coalesce(v_company_description, ''))) > 0) then
            return null;
        end if;
        if v_client.telegram_username is not null
            and (position(lower(v_client.telegram_username) in lower(v_revision.title)) > 0
                or position(lower(v_client.telegram_username) in lower(v_revision.description_text)) > 0
                or position(lower(v_client.telegram_username)
                    in lower(coalesce(v_company_description, ''))) > 0
                or position(lower('@' || v_client.telegram_username) in lower(v_revision.title)) > 0
                or position(lower('@' || v_client.telegram_username)
                    in lower(v_revision.description_text)) > 0
                or position(lower('@' || v_client.telegram_username)
                    in lower(coalesce(v_company_description, ''))) > 0) then
            return null;
        end if;
        if v_client.website is not null then
            v_host := substring(v_client.website from '^https?://([^/?#]+)');
            if v_host is not null
                and (position(lower(v_host) in lower(v_revision.title)) > 0
                    or position(lower(v_host) in lower(v_revision.description_text)) > 0
                    or position(lower(v_host)
                        in lower(coalesce(v_company_description, ''))) > 0) then
                return null;
            end if;
        end if;
        v_doc_json := lower(v_revision.description_document::text);
        if jsonb_typeof(v_client.social_links) = 'array' then
            for v_url in select value from jsonb_array_elements(v_client.social_links) loop
                if v_url ->> 'url' is not null
                    and position(lower(v_url ->> 'url') in v_doc_json) > 0 then
                    return null;
                end if;
            end loop;
        end if;
    end if;

    return jsonb_build_object(
        'title', v_revision.title,
        'employmentType', v_revision.employment_type,
        'workplaceMode', v_revision.workplace_mode,
        'locations', v_revision.locations,
        'remoteRegions', v_revision.remote_regions,
        'compensation', jsonb_build_object(
            'min', v_revision.compensation_min::text,
            'max', v_revision.compensation_max::text,
            'currency', v_revision.currency,
            'payPeriod', v_revision.pay_period
        ),
        'bonuses', v_revision.bonuses,
        'descriptionDocument', v_revision.description_document,
        'company', jsonb_build_object(
            'name', v_company_name,
            'description', v_company_description
        )
    );
end
$$;

create function app.save_client_draft_v1(
    p_client_id uuid,
    p_expected_version bigint,
    p_fields jsonb,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_client app.clients;
    v_fields jsonb;
    v_keys text[];
    v_field_names jsonb;
    v_new_version bigint;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['clients.read', 'clients.write'], p_operation_id, p_correlation_id, true);
    if p_client_id is null
        or (p_expected_version is not null and p_expected_version <= 0) then
        raise exception 'save_client_draft_v1 requires a client id and a positive or null expected version'
            using errcode = '22023';
    end if;
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        raise exception 'Client draft fields are invalid' using errcode = '22023';
    end if;
    select coalesce(array_agg(k), '{}'::text[]) into v_keys
    from jsonb_object_keys(p_fields) k;
    if not (v_keys @> array[
        'name', 'contactName', 'contactEmail', 'telegramUsername', 'website',
        'socialLinks', 'isStealth', 'anonymousDescription'
    ] and v_keys <@ array[
        'name', 'contactName', 'contactEmail', 'telegramUsername', 'website',
        'socialLinks', 'isStealth', 'anonymousDescription'
    ]) then
        raise exception 'Client draft fields are invalid' using errcode = '22023';
    end if;
    v_fields := app.client_draft_fields_sanitized_v1(p_fields);
    if not app.client_draft_fields_valid_v1(v_fields) then
        raise exception 'Client draft fields are invalid' using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'client.draft.saved',
            'id', p_client_id,
            'expectedVersion', p_expected_version,
            'fields', p_fields
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'client.draft.saved', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id
    for update of c;

    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_field_names
    from jsonb_object_keys(v_fields) k;

    if p_expected_version is null then
        if v_client.id is not null then
            raise exception 'Client already exists' using errcode = '23505';
        end if;
        insert into app.clients (
            id, organization_id, name, status,
            contact_name, contact_email, telegram_username, website,
            social_links, is_stealth, anonymous_description,
            version, public_profile_version
        ) values (
            p_client_id, v_org, btrim(v_fields ->> 'name'), 'draft',
            v_fields ->> 'contactName',
            v_fields ->> 'contactEmail',
            v_fields ->> 'telegramUsername', v_fields ->> 'website',
            v_fields -> 'socialLinks', (v_fields ->> 'isStealth')::boolean,
            v_fields ->> 'anonymousDescription', 1, 1
        );
        v_new_version := 1;
    else
        if v_client.id is null then
            raise exception 'Client not found' using errcode = 'P0002';
        end if;
        if v_client.version <> p_expected_version then
            raise exception 'Client version does not match expected version'
                using errcode = '40001';
        end if;
        if v_client.status <> 'draft' then
            raise exception 'Only a draft client can be saved as a draft'
                using errcode = '23514';
        end if;
        v_new_version := v_client.version + 1;
        update app.clients set
            name = btrim(v_fields ->> 'name'),
            contact_name = v_fields ->> 'contactName',
            contact_email = v_fields ->> 'contactEmail',
            telegram_username = v_fields ->> 'telegramUsername',
            website = v_fields ->> 'website',
            social_links = v_fields -> 'socialLinks',
            is_stealth = (v_fields ->> 'isStealth')::boolean,
            anonymous_description = v_fields ->> 'anonymousDescription',
            version = v_new_version,
            updated_at = v_now
        where organization_id = v_org and id = p_client_id;
    end if;

    v_result := jsonb_build_object(
        'id', p_client_id,
        'version', v_new_version::text,
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'client.draft.saved', p_client_id,
        v_digest, v_result,
        jsonb_build_object(
            'previous_version', p_expected_version,
            'new_version', v_new_version,
            'field_names', v_field_names
        )
    );
    return v_result;
end
$$;

create function app.save_client_v1(
    p_client_id uuid,
    p_expected_version bigint,
    p_fields jsonb,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_client app.clients;
    v_field_names jsonb;
    v_stealth boolean;
    v_new_version bigint;
    v_public_version bigint;
    v_public_changed boolean;
    v_is_admin boolean;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['clients.read', 'clients.write'], p_operation_id, p_correlation_id, true);
    if p_client_id is null
        or (p_expected_version is not null and p_expected_version <= 0) then
        raise exception 'save_client_v1 requires a client id and a positive or null expected version'
            using errcode = '22023';
    end if;
    if not app.client_fields_valid_v1(p_fields) then
        raise exception 'Client fields are invalid' using errcode = '22023';
    end if;
    v_stealth := (p_fields ->> 'isStealth')::boolean;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'client.saved',
            'id', p_client_id,
            'expectedVersion', p_expected_version,
            'fields', p_fields
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'client.saved', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id
    for update of c;

    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_field_names
    from jsonb_object_keys(p_fields) k;

    if p_expected_version is null then
        if v_client.id is not null then
            raise exception 'Client already exists' using errcode = '23505';
        end if;
        insert into app.clients (
            id, organization_id, name, status,
            contact_name, contact_email, telegram_username, website,
            social_links, is_stealth, anonymous_description,
            version, public_profile_version
        ) values (
            p_client_id, v_org, btrim(p_fields ->> 'name'), 'active',
            btrim(p_fields ->> 'contactName'), btrim(p_fields ->> 'contactEmail'),
            p_fields ->> 'telegramUsername', p_fields ->> 'website',
            p_fields -> 'socialLinks', v_stealth,
            p_fields ->> 'anonymousDescription', 1, 1
        );
        v_new_version := 1;
        v_public_version := 1;
        v_public_changed := null;
    else
        if v_client.id is null then
            raise exception 'Client not found' using errcode = 'P0002';
        end if;
        if v_client.version <> p_expected_version then
            raise exception 'Client version does not match expected version'
                using errcode = '40001';
        end if;
        if v_client.status = 'archived' then
            raise exception 'An archived client cannot be saved' using errcode = '23514';
        end if;
        if v_client.is_stealth is true and v_stealth is not true then
            select r.system_kind = 'admin' into v_is_admin
            from app.organization_memberships m
            join app.roles r
                on r.organization_id = m.organization_id and r.id = m.role_id
            where m.id = v_member;
            if v_is_admin is not true then
                raise exception 'Revealing a stealth client requires an Admin membership'
                    using errcode = '42501';
            end if;
        end if;
        v_public_changed := v_client.name is distinct from btrim(p_fields ->> 'name')
            or v_client.is_stealth is distinct from v_stealth
            or v_client.anonymous_description
                is distinct from (p_fields ->> 'anonymousDescription');
        v_new_version := v_client.version + 1;
        v_public_version := case
            when v_public_changed then v_client.public_profile_version + 1
            else v_client.public_profile_version
        end;
        update app.clients set
            name = btrim(p_fields ->> 'name'),
            status = 'active',
            contact_name = btrim(p_fields ->> 'contactName'),
            contact_email = btrim(p_fields ->> 'contactEmail'),
            telegram_username = p_fields ->> 'telegramUsername',
            website = p_fields ->> 'website',
            social_links = p_fields -> 'socialLinks',
            is_stealth = v_stealth,
            anonymous_description = p_fields ->> 'anonymousDescription',
            version = v_new_version,
            public_profile_version = v_public_version,
            updated_at = v_now
        where organization_id = v_org and id = p_client_id;
    end if;

    v_result := jsonb_build_object(
        'id', p_client_id,
        'version', v_new_version::text,
        'publicProfileVersion', v_public_version::text,
        'status', 'active'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'client.saved', p_client_id,
        v_digest, v_result,
        jsonb_build_object(
            'previous_version', p_expected_version,
            'new_version', v_new_version,
            'public_profile_changed', v_public_changed,
            'field_names', v_field_names
        )
    );
    return v_result;
end
$$;

create function app.create_job_draft_v1(
    p_job_id uuid,
    p_revision_id uuid,
    p_client_id uuid,
    p_fields jsonb,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_client app.clients;
    v_pipeline uuid;
    v_doc jsonb;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_job_id is null or p_revision_id is null or p_client_id is null then
        raise exception 'create_job_draft_v1 requires job, revision and client ids'
            using errcode = '22023';
    end if;
    if not app.job_fields_valid_v1(p_fields, false) then
        raise exception 'Job fields are invalid' using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.draft.created',
            'jobId', p_job_id,
            'revisionId', p_revision_id,
            'clientId', p_client_id,
            'fields', p_fields
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.draft.created', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id
    for update of c;
    if not found then
        raise exception 'Client not found' using errcode = 'P0002';
    end if;
    if not app.client_configured_v1(v_client) then
        raise exception 'Client is not active and configured' using errcode = '23514';
    end if;

    select p.id into v_pipeline
    from app.pipelines p
    where p.organization_id = v_org and p.key = 'default' and p.status = 'active';
    if v_pipeline is null then
        raise exception 'A default active pipeline is required' using errcode = '23514';
    end if;

    insert into app.jobs (
        id, organization_id, client_id, pipeline_id, slug, title, description,
        location_display, employment_type, publication_state, application_state, version
    ) values (
        p_job_id, v_org, p_client_id, v_pipeline, 'job-' || p_job_id::text,
        btrim(p_fields ->> 'title'), '', '', '', 'draft', 'open', 1
    );

    v_doc := p_fields -> 'descriptionDocument';
    insert into app.job_revisions (
        id, organization_id, job_id, revision_number, title,
        employment_type, workplace_mode, locations, remote_regions,
        compensation_min, compensation_max, currency, pay_period, bonuses,
        description_document, description_text, status, version
    ) values (
        p_revision_id, v_org, p_job_id, 1, btrim(p_fields ->> 'title'),
        p_fields ->> 'employmentType', p_fields ->> 'workplaceMode',
        coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'locations')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'remoteRegions')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        (p_fields ->> 'compensationMin')::numeric,
        (p_fields ->> 'compensationMax')::numeric,
        p_fields ->> 'currency', p_fields ->> 'payPeriod',
        p_fields -> 'bonuses',
        v_doc, app.job_document_text_v1(v_doc), 'draft', 1
    );

    v_result := jsonb_build_object(
        'jobId', p_job_id,
        'revisionId', p_revision_id,
        'jobVersion', '1',
        'revisionVersion', '1',
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.draft.created', p_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', p_client_id,
            'new_version', 1
        )
    );
    return v_result;
end
$$;

create function app.save_job_draft_v1(
    p_revision_id uuid,
    p_expected_version bigint,
    p_fields jsonb,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_revision app.job_revisions;
    v_job_id uuid;
    v_client_id uuid;
    v_job_version bigint;
    v_doc jsonb;
    v_field_names jsonb;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_revision_id is null
        or p_expected_version is null or p_expected_version <= 0 then
        raise exception 'save_job_draft_v1 requires a revision id and a positive expected version'
            using errcode = '22023';
    end if;
    if not app.job_fields_valid_v1(p_fields, false) then
        raise exception 'Job fields are invalid' using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.draft.saved',
            'revisionId', p_revision_id,
            'expectedVersion', p_expected_version,
            'fields', p_fields
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.draft.saved', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select r.job_id into v_job_id
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id;
    if v_job_id is null then
        raise exception 'Job revision not found' using errcode = 'P0002';
    end if;
    select j.client_id into v_client_id
    from app.jobs j
    where j.organization_id = v_org and j.id = v_job_id;
    perform c.id from app.clients c
    where c.organization_id = v_org and c.id = v_client_id
    for update of c;
    perform j.id from app.jobs j
    where j.organization_id = v_org and j.id = v_job_id
    for update of j;
    select r.* into v_revision
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id
    for update of r;
    if v_revision.status <> 'draft' then
        raise exception 'Only a draft revision can be saved' using errcode = '23514';
    end if;
    if v_revision.version <> p_expected_version then
        raise exception 'Revision version does not match expected version'
            using errcode = '40001';
    end if;
    select j.version into v_job_version
    from app.jobs j
    where j.organization_id = v_org and j.id = v_job_id;

    v_doc := p_fields -> 'descriptionDocument';
    update app.job_revisions set
        title = btrim(p_fields ->> 'title'),
        employment_type = p_fields ->> 'employmentType',
        workplace_mode = p_fields ->> 'workplaceMode',
        locations = coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'locations')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        remote_regions = coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'remoteRegions')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        compensation_min = (p_fields ->> 'compensationMin')::numeric,
        compensation_max = (p_fields ->> 'compensationMax')::numeric,
        currency = p_fields ->> 'currency',
        pay_period = p_fields ->> 'payPeriod',
        bonuses = p_fields -> 'bonuses',
        description_document = v_doc,
        description_text = app.job_document_text_v1(v_doc),
        version = v_revision.version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_revision_id;

    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_field_names
    from jsonb_object_keys(p_fields) k;

    v_result := jsonb_build_object(
        'jobId', v_job_id,
        'revisionId', p_revision_id,
        'jobVersion', v_job_version::text,
        'revisionVersion', (v_revision.version + 1)::text,
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.draft.saved', v_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', v_client_id,
            'previous_version', v_revision.version,
            'new_version', v_revision.version + 1,
            'field_names', v_field_names
        )
    );
    return v_result;
end
$$;

create function app.begin_job_revision_v1(
    p_job_id uuid,
    p_revision_id uuid,
    p_expected_job_version bigint,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_client_id uuid;
    v_job app.jobs;
    v_source app.job_revisions;
    v_number integer;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_job_id is null or p_revision_id is null
        or p_expected_job_version is null or p_expected_job_version <= 0 then
        raise exception 'begin_job_revision_v1 requires job and revision ids and a positive version'
            using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.revision.started',
            'jobId', p_job_id,
            'revisionId', p_revision_id,
            'expectedJobVersion', p_expected_job_version
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.revision.started', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select j.client_id into v_client_id
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id;
    if v_client_id is null then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    perform c.id from app.clients c
    where c.organization_id = v_org and c.id = v_client_id
    for update of c;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id
    for update of j;
    if v_job.version <> p_expected_job_version then
        raise exception 'Job version does not match expected version'
            using errcode = '40001';
    end if;
    if v_job.published_revision_id is null then
        raise exception 'Job has no published revision to revise'
            using errcode = '23514';
    end if;
    if exists (
        select 1 from app.job_revisions r
        where r.organization_id = v_org and r.job_id = p_job_id and r.status = 'draft'
    ) then
        raise exception 'A draft revision already exists' using errcode = '23505';
    end if;
    select r.* into v_source
    from app.job_revisions r
    where r.organization_id = v_org and r.job_id = p_job_id
        and r.id = v_job.published_revision_id;
    if not found then
        raise exception 'Published revision not found' using errcode = 'P0002';
    end if;
    select coalesce(max(r.revision_number), 0) + 1 into v_number
    from app.job_revisions r
    where r.organization_id = v_org and r.job_id = p_job_id;

    insert into app.job_revisions (
        id, organization_id, job_id, revision_number, title,
        employment_type, workplace_mode, locations, remote_regions,
        compensation_min, compensation_max, currency, pay_period, bonuses,
        description_document, description_text, status, version
    ) values (
        p_revision_id, v_org, p_job_id, v_number, v_source.title,
        v_source.employment_type, v_source.workplace_mode, v_source.locations,
        v_source.remote_regions, v_source.compensation_min, v_source.compensation_max,
        v_source.currency, v_source.pay_period, v_source.bonuses,
        v_source.description_document, v_source.description_text, 'draft', 1
    );

    v_result := jsonb_build_object(
        'jobId', p_job_id,
        'revisionId', p_revision_id,
        'jobVersion', v_job.version::text,
        'revisionVersion', '1',
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.revision.started', p_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', v_client_id,
            'source_revision_id', v_job.published_revision_id
        )
    );
    return v_result;
end
$$;

create function app.duplicate_job_v1(
    p_source_revision_id uuid,
    p_expected_source_version bigint,
    p_client_id uuid,
    p_job_id uuid,
    p_revision_id uuid,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_source_job_id uuid;
    v_client app.clients;
    v_source app.job_revisions;
    v_pipeline uuid;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_source_revision_id is null or p_client_id is null
        or p_job_id is null or p_revision_id is null
        or p_expected_source_version is null or p_expected_source_version <= 0 then
        raise exception 'duplicate_job_v1 requires source, client and new ids and a positive version'
            using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.duplicated',
            'sourceRevisionId', p_source_revision_id,
            'expectedSourceVersion', p_expected_source_version,
            'clientId', p_client_id,
            'jobId', p_job_id,
            'revisionId', p_revision_id
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.duplicated', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select r.job_id into v_source_job_id
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_source_revision_id;
    if v_source_job_id is null then
        raise exception 'Source revision not found' using errcode = 'P0002';
    end if;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id
    for update of c;
    if not found then
        raise exception 'Client not found' using errcode = 'P0002';
    end if;
    if not app.client_configured_v1(v_client) then
        raise exception 'Client is not active and configured' using errcode = '23514';
    end if;
    perform j.id from app.jobs j
    where j.organization_id = v_org and j.id = v_source_job_id
    for update of j;
    select r.* into v_source
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_source_revision_id
    for update of r;
    if v_source.version <> p_expected_source_version then
        raise exception 'Source revision version does not match expected version'
            using errcode = '40001';
    end if;

    select p.id into v_pipeline
    from app.pipelines p
    where p.organization_id = v_org and p.key = 'default' and p.status = 'active';
    if v_pipeline is null then
        raise exception 'A default active pipeline is required' using errcode = '23514';
    end if;

    insert into app.jobs (
        id, organization_id, client_id, pipeline_id, slug, title, description,
        location_display, employment_type, publication_state, application_state, version
    ) values (
        p_job_id, v_org, p_client_id, v_pipeline, 'job-' || p_job_id::text,
        v_source.title, '', '', '', 'draft', 'open', 1
    );

    insert into app.job_revisions (
        id, organization_id, job_id, revision_number, title,
        employment_type, workplace_mode, locations, remote_regions,
        compensation_min, compensation_max, currency, pay_period, bonuses,
        description_document, description_text, status, version
    ) values (
        p_revision_id, v_org, p_job_id, 1, v_source.title,
        v_source.employment_type, v_source.workplace_mode, v_source.locations,
        v_source.remote_regions, v_source.compensation_min, v_source.compensation_max,
        v_source.currency, v_source.pay_period, v_source.bonuses,
        v_source.description_document, v_source.description_text, 'draft', 1
    );

    v_result := jsonb_build_object(
        'jobId', p_job_id,
        'revisionId', p_revision_id,
        'jobVersion', '1',
        'revisionVersion', '1',
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.duplicated', p_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', p_client_id,
            'source_job_id', v_source_job_id,
            'source_revision_id', p_source_revision_id
        )
    );
    return v_result;
end
$$;

create function app.preview_job_public_v1(p_revision_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_revision app.job_revisions;
    v_job app.jobs;
    v_client app.clients;
    v_fields jsonb;
    v_projection jsonb;
    v_bundle jsonb;
    v_hash text;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'clients.read'], null, null, false);
    if p_revision_id is null then
        raise exception 'preview_job_public_v1 requires a revision id' using errcode = '22023';
    end if;
    select r.* into v_revision
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id;
    if not found then
        raise exception 'Job revision not found' using errcode = 'P0002';
    end if;
    if v_revision.status <> 'draft' then
        raise exception 'Only a draft revision can be previewed' using errcode = '23514';
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = v_revision.job_id;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = v_job.client_id;

    v_fields := jsonb_build_object(
        'title', v_revision.title,
        'employmentType', v_revision.employment_type,
        'workplaceMode', v_revision.workplace_mode,
        'locations', v_revision.locations,
        'remoteRegions', v_revision.remote_regions,
        'compensationMin', v_revision.compensation_min::text,
        'compensationMax', v_revision.compensation_max::text,
        'currency', v_revision.currency,
        'payPeriod', v_revision.pay_period,
        'bonuses', v_revision.bonuses,
        'descriptionDocument', v_revision.description_document
    );
    if not app.job_fields_valid_v1(v_fields, true) then
        raise exception 'Job draft is not ready to publish' using errcode = '23514';
    end if;

    v_projection := app.job_public_projection_v1(p_revision_id);
    if v_projection is null then
        raise exception 'Public projection is not available for this revision'
            using errcode = '23514';
    end if;

    v_bundle := jsonb_build_object(
        'revisionId', v_revision.id,
        'revisionVersion', v_revision.version::text,
        'clientId', v_job.client_id,
        'clientVersion', v_client.public_profile_version::text,
        'projection', v_projection
    );
    v_hash := pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(v_bundle::text, 'UTF8')), 'hex');

    return jsonb_build_object(
        'projection', v_projection,
        'revisionVersion', v_revision.version::text,
        'clientVersion', v_client.public_profile_version::text,
        'reviewHash', v_hash
    );
end
$$;

create function app.publish_job_revision_v1(
    p_revision_id uuid,
    p_expected_version bigint,
    p_expected_client_version bigint,
    p_review_hash bytea,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_job_id uuid;
    v_client_id uuid;
    v_revision app.job_revisions;
    v_job app.jobs;
    v_client app.clients;
    v_fields jsonb;
    v_projection jsonb;
    v_bundle jsonb;
    v_hash bytea;
    v_location_display text;
    v_salary_display text;
    v_company_name text;
    v_company_description text;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_revision_id is null
        or p_expected_version is null or p_expected_version <= 0
        or p_expected_client_version is null or p_expected_client_version <= 0
        or p_review_hash is null or pg_catalog.octet_length(p_review_hash) <> 32 then
        raise exception 'publish_job_revision_v1 requires ids, positive versions and a 32-byte review hash'
            using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.published',
            'revisionId', p_revision_id,
            'expectedVersion', p_expected_version,
            'expectedClientVersion', p_expected_client_version,
            'reviewHash', pg_catalog.encode(p_review_hash, 'hex')
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.published', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select r.job_id into v_job_id
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id;
    if v_job_id is null then
        raise exception 'Job revision not found' using errcode = 'P0002';
    end if;
    select j.client_id into v_client_id
    from app.jobs j
    where j.organization_id = v_org and j.id = v_job_id;
    perform c.id from app.clients c
    where c.organization_id = v_org and c.id = v_client_id
    for update of c;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = v_job_id
    for update of j;
    select r.* into v_revision
    from app.job_revisions r
    where r.organization_id = v_org and r.id = p_revision_id
    for update of r;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = v_client_id;

    if v_revision.status <> 'draft' then
        raise exception 'Only a draft revision can be published' using errcode = '23514';
    end if;
    if v_revision.version <> p_expected_version then
        raise exception 'Revision version does not match expected version'
            using errcode = '40001';
    end if;
    if v_client.public_profile_version <> p_expected_client_version then
        raise exception 'Client profile version does not match expected version'
            using errcode = '40001';
    end if;

    v_fields := jsonb_build_object(
        'title', v_revision.title,
        'employmentType', v_revision.employment_type,
        'workplaceMode', v_revision.workplace_mode,
        'locations', v_revision.locations,
        'remoteRegions', v_revision.remote_regions,
        'compensationMin', v_revision.compensation_min::text,
        'compensationMax', v_revision.compensation_max::text,
        'currency', v_revision.currency,
        'payPeriod', v_revision.pay_period,
        'bonuses', v_revision.bonuses,
        'descriptionDocument', v_revision.description_document
    );
    if not app.job_fields_valid_v1(v_fields, true) then
        raise exception 'Job draft is not ready to publish' using errcode = '23514';
    end if;

    v_projection := app.job_public_projection_v1(p_revision_id);
    if v_projection is null then
        raise exception 'Public projection is not available for this revision'
            using errcode = '23514';
    end if;
    v_bundle := jsonb_build_object(
        'revisionId', v_revision.id,
        'revisionVersion', v_revision.version::text,
        'clientId', v_job.client_id,
        'clientVersion', v_client.public_profile_version::text,
        'projection', v_projection
    );
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(v_bundle::text, 'UTF8'));
    if v_hash <> p_review_hash then
        raise exception 'Review hash does not match the current preview'
            using errcode = '40001';
    end if;

    if v_client.is_stealth then
        v_company_name := 'Stealth company';
        v_company_description := v_client.anonymous_description;
    else
        v_company_name := v_client.name;
        v_company_description := null;
    end if;

    if v_job.published_revision_id is not null then
        update app.job_revisions set status = 'superseded'
        where organization_id = v_org and id = v_job.published_revision_id
            and status = 'published';
    end if;

    update app.job_revisions set
        status = 'published',
        version = v_revision.version + 1,
        updated_at = v_now,
        published_at = v_now,
        published_by_membership_id = v_member,
        published_client_profile_version = v_client.public_profile_version,
        published_company_name = v_company_name,
        published_company_description = v_company_description,
        published_is_stealth = v_client.is_stealth
    where organization_id = v_org and id = p_revision_id;

    v_location_display := case v_revision.workplace_mode
        when 'remote' then case
            when coalesce(cardinality(v_revision.remote_regions), 0) > 0
                then 'Remote (' || array_to_string(v_revision.remote_regions, ', ') || ')'
            else 'Remote'
        end
        else array_to_string(v_revision.locations, ', ')
    end;
    v_salary_display := case
        when v_revision.compensation_min is null then null
        when v_revision.compensation_min = v_revision.compensation_max then
            v_revision.compensation_min::text || ' ' || v_revision.currency
                || '/' || v_revision.pay_period
        else v_revision.compensation_min::text || '–' || v_revision.compensation_max::text
            || ' ' || v_revision.currency || '/' || v_revision.pay_period
    end;

    update app.jobs set
        publication_state = 'published',
        published_revision_id = p_revision_id,
        title = v_revision.title,
        description = v_revision.description_text,
        location_display = v_location_display,
        employment_type = v_revision.employment_type,
        salary_display = v_salary_display,
        publication_reviewed_by = v_member,
        publication_reviewed_at = v_now,
        published_at = v_now,
        version = v_job.version + 1,
        updated_at = v_now
    where organization_id = v_org and id = v_job_id;

    v_result := jsonb_build_object(
        'jobId', v_job_id,
        'revisionId', p_revision_id,
        'jobVersion', (v_job.version + 1)::text,
        'revisionVersion', (v_revision.version + 1)::text,
        'status', 'published'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.published', v_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', v_client_id,
            'previous_version', v_job.version,
            'new_version', v_job.version + 1
        )
    );
    return v_result;
end
$$;

create function app.get_client_v1(p_client_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_client app.clients;
begin
    v_member := app.recruitment_actor_v1(array['clients.read'], null, null, false);
    if p_client_id is null then
        raise exception 'get_client_v1 requires a client id' using errcode = '22023';
    end if;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id;
    if not found then
        raise exception 'Client not found' using errcode = 'P0002';
    end if;
    return jsonb_build_object(
        'id', v_client.id,
        'name', v_client.name,
        'status', v_client.status,
        'contactName', v_client.contact_name,
        'contactEmail', v_client.contact_email,
        'telegramUsername', v_client.telegram_username,
        'website', v_client.website,
        'socialLinks', v_client.social_links,
        'isStealth', v_client.is_stealth,
        'anonymousDescription', v_client.anonymous_description,
        'version', v_client.version::text,
        'publicProfileVersion', v_client.public_profile_version::text
    );
end
$$;

create function app.get_job_workspace_v1(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_job app.jobs;
    v_client app.clients;
    v_draft app.job_revisions;
    v_published app.job_revisions;
    v_needs_review boolean := false;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'clients.read'], null, null, false);
    if p_job_id is null then
        raise exception 'get_job_workspace_v1 requires a job id' using errcode = '22023';
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id;
    if not found then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = v_job.client_id;
    select r.* into v_draft
    from app.job_revisions r
    where r.organization_id = v_org and r.job_id = p_job_id and r.status = 'draft';
    if v_job.published_revision_id is not null then
        select r.* into v_published
        from app.job_revisions r
        where r.organization_id = v_org and r.job_id = p_job_id
            and r.id = v_job.published_revision_id;
        if found and v_client.id is not null
            and v_client.public_profile_version
                is distinct from v_published.published_client_profile_version then
            v_needs_review := true;
        end if;
    end if;
    return jsonb_build_object(
        'job', jsonb_build_object(
            'id', v_job.id,
            'clientId', v_job.client_id,
            'pipelineId', v_job.pipeline_id,
            'slug', v_job.slug,
            'title', v_job.title,
            'publicationState', v_job.publication_state,
            'applicationState', v_job.application_state,
            'publishedRevisionId', v_job.published_revision_id,
            'version', v_job.version::text
        ),
        'draft', case when v_draft.id is null then null
            else app.job_revision_dto_v1(v_draft) end,
        'published', case when v_published.id is null then null
            else app.job_revision_dto_v1(v_published) end,
        'publicationNeedsReview', v_needs_review
    );
end
$$;

create function app.get_job_publication_v1(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_job app.jobs;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'clients.read'], null, null, false);
    if p_job_id is null then
        raise exception 'get_job_publication_v1 requires a job id' using errcode = '22023';
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id;
    if not found then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    if v_job.publication_state <> 'published' or v_job.published_revision_id is null then
        return null;
    end if;
    return app.job_public_projection_v1(v_job.published_revision_id);
end
$$;

revoke all on function app.safe_url_valid_v1(text) from public;
revoke all on function app.normalize_url_input_v1(text) from public;
revoke all on function app.job_doc_mark_ok_v1(jsonb) from public;
revoke all on function app.job_doc_marks_ok_v1(jsonb) from public;
revoke all on function app.job_doc_content_ok_v1(jsonb, text[], boolean) from public;
revoke all on function app.job_doc_node_ok_v1(jsonb, text) from public;
revoke all on function app.job_document_valid_v1(jsonb) from public;
revoke all on function app.job_document_text_v1(jsonb) from public;
revoke all on function app.location_label_valid_v1(text) from public;
revoke all on function app.job_label_array_valid_v1(text[]) from public;
revoke all on function app.job_bonuses_valid_v1(jsonb) from public;
revoke all on function app.social_platform_url_valid_v1(text, text) from public;
revoke all on function app.client_social_links_valid_v1(jsonb) from public;
revoke all on function app.client_draft_fields_sanitized_v1(jsonb) from public;
revoke all on function app.client_fields_valid_v1(jsonb) from public;
revoke all on function app.client_draft_fields_valid_v1(jsonb) from public;
revoke all on function app.job_fields_valid_v1(jsonb, boolean) from public;
revoke all on function app.client_configured_v1(app.clients) from public;
revoke all on function app.job_revision_dto_v1(app.job_revisions) from public;
revoke all on function app.job_revision_guard_v1() from public;
revoke all on function app.recruitment_actor_v1(text[], uuid, uuid, boolean) from public;
revoke all on function app.recruitment_receipt_v1(uuid, text, bytea) from public;
revoke all on function app.recruitment_record_v1(uuid, uuid, uuid, text, uuid, bytea, jsonb, jsonb) from public;
revoke all on function app.job_public_projection_v1(uuid) from public;
revoke all on function app.save_client_draft_v1(uuid, bigint, jsonb, uuid, uuid) from public;
revoke all on function app.save_client_v1(uuid, bigint, jsonb, uuid, uuid) from public;
revoke all on function app.create_job_draft_v1(uuid, uuid, uuid, jsonb, uuid, uuid) from public;
revoke all on function app.save_job_draft_v1(uuid, bigint, jsonb, uuid, uuid) from public;
revoke all on function app.begin_job_revision_v1(uuid, uuid, bigint, uuid, uuid) from public;
revoke all on function app.duplicate_job_v1(uuid, bigint, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function app.preview_job_public_v1(uuid) from public;
revoke all on function app.publish_job_revision_v1(uuid, bigint, bigint, bytea, uuid, uuid) from public;
revoke all on function app.get_client_v1(uuid) from public;
revoke all on function app.get_job_workspace_v1(uuid) from public;
revoke all on function app.get_job_publication_v1(uuid) from public;

grant execute on function app.safe_url_valid_v1(text) to app_executor;
grant execute on function app.normalize_url_input_v1(text) to app_executor;
grant execute on function app.job_doc_mark_ok_v1(jsonb) to app_executor;
grant execute on function app.job_doc_marks_ok_v1(jsonb) to app_executor;
grant execute on function app.job_doc_content_ok_v1(jsonb, text[], boolean) to app_executor;
grant execute on function app.job_doc_node_ok_v1(jsonb, text) to app_executor;
grant execute on function app.job_document_valid_v1(jsonb) to app_executor;
grant execute on function app.job_document_text_v1(jsonb) to app_executor;
grant execute on function app.location_label_valid_v1(text) to app_executor;
grant execute on function app.job_label_array_valid_v1(text[]) to app_executor;
grant execute on function app.job_bonuses_valid_v1(jsonb) to app_executor;
grant execute on function app.social_platform_url_valid_v1(text, text) to app_executor;
grant execute on function app.client_social_links_valid_v1(jsonb) to app_executor;
grant execute on function app.client_draft_fields_sanitized_v1(jsonb) to app_executor;
grant execute on function app.client_fields_valid_v1(jsonb) to app_executor;
grant execute on function app.client_draft_fields_valid_v1(jsonb) to app_executor;
grant execute on function app.job_fields_valid_v1(jsonb, boolean) to app_executor;
grant execute on function app.client_configured_v1(app.clients) to app_executor;
grant execute on function app.job_revision_dto_v1(app.job_revisions) to app_executor;
grant execute on function app.job_revision_guard_v1() to app_executor;
grant execute on function app.recruitment_actor_v1(text[], uuid, uuid, boolean) to app_executor;
grant execute on function app.recruitment_receipt_v1(uuid, text, bytea) to app_executor;
grant execute on function app.recruitment_record_v1(uuid, uuid, uuid, text, uuid, bytea, jsonb, jsonb) to app_executor;
grant execute on function app.job_public_projection_v1(uuid) to app_executor;

grant execute on function app.save_client_draft_v1(uuid, bigint, jsonb, uuid, uuid) to app_staff;
grant execute on function app.save_client_v1(uuid, bigint, jsonb, uuid, uuid) to app_staff;
grant execute on function app.create_job_draft_v1(uuid, uuid, uuid, jsonb, uuid, uuid) to app_staff;
grant execute on function app.save_job_draft_v1(uuid, bigint, jsonb, uuid, uuid) to app_staff;
grant execute on function app.begin_job_revision_v1(uuid, uuid, bigint, uuid, uuid) to app_staff;
grant execute on function app.duplicate_job_v1(uuid, bigint, uuid, uuid, uuid, uuid, uuid) to app_staff;
grant execute on function app.preview_job_public_v1(uuid) to app_staff;
grant execute on function app.publish_job_revision_v1(uuid, bigint, bigint, bytea, uuid, uuid) to app_staff;
grant execute on function app.get_client_v1(uuid) to app_staff;
grant execute on function app.get_job_workspace_v1(uuid) to app_staff;
grant execute on function app.get_job_publication_v1(uuid) to app_staff;

grant select on app.clients to app_executor;
grant insert (
    id, organization_id, name, status, contact_name, contact_email,
    telegram_username, website, social_links, is_stealth, anonymous_description,
    version, public_profile_version
) on app.clients to app_executor;
grant update (
    name, status, contact_name, contact_email, telegram_username, website,
    social_links, is_stealth, anonymous_description, public_profile_version,
    updated_at, version
) on app.clients to app_executor;

grant select on app.pipelines to app_executor;

grant select on app.jobs to app_executor;
grant insert (
    id, organization_id, client_id, pipeline_id, slug, title, description,
    location_display, employment_type, publication_state, application_state,
    version
) on app.jobs to app_executor;
grant update (
    title, description, salary_display, location_display, employment_type,
    publication_state, published_revision_id, publication_reviewed_by,
    publication_reviewed_at, published_at, updated_at, version
) on app.jobs to app_executor;

grant select on app.job_revisions to app_executor;
grant insert (
    id, organization_id, job_id, revision_number, title, employment_type,
    workplace_mode, locations, remote_regions, compensation_min, compensation_max,
    currency, pay_period, bonuses, description_document, description_text,
    status, version
) on app.job_revisions to app_executor;
grant update (
    title, employment_type, workplace_mode, locations, remote_regions,
    compensation_min, compensation_max, currency, pay_period, bonuses,
    description_document, description_text, status, version, updated_at,
    published_at, published_by_membership_id, published_client_profile_version,
    published_company_name, published_company_description, published_is_stealth
) on app.job_revisions to app_executor;

grant select, insert (
    operation_id, organization_id, actor_user_id, actor_membership_id, kind,
    target_id, request_sha256, result
) on app.recruitment_operation_receipts to app_executor;

create policy executor_clients_select on app.clients
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('clients.read'));

create policy executor_clients_insert on app.clients
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('clients.write'));

create policy executor_clients_update on app.clients
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('clients.write'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('clients.write'));

create policy executor_pipelines_select on app.pipelines
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.read'));

create policy executor_jobs_select on app.jobs
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.read')
        and app.has_permission_v1('clients.read'));

create policy executor_jobs_insert on app.jobs
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'));

create policy executor_jobs_update on app.jobs
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'));

create policy executor_job_revisions_select on app.job_revisions
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.read')
        and app.has_permission_v1('clients.read'));

create policy executor_job_revisions_insert on app.job_revisions
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'));

create policy executor_job_revisions_update on app.job_revisions
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('jobs.write')
        and app.has_permission_v1('clients.read'));

create policy executor_recruitment_receipts_select on app.recruitment_operation_receipts
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and actor_user_id = app.context_uuid_v1('app.actor_id'));

create policy executor_recruitment_receipts_insert on app.recruitment_operation_receipts
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and actor_user_id = app.context_uuid_v1('app.actor_id'));

grant create on schema app to app_executor;

reset role;

alter function app.save_client_draft_v1(uuid, bigint, jsonb, uuid, uuid) owner to app_executor;
alter function app.save_client_v1(uuid, bigint, jsonb, uuid, uuid) owner to app_executor;
alter function app.create_job_draft_v1(uuid, uuid, uuid, jsonb, uuid, uuid) owner to app_executor;
alter function app.save_job_draft_v1(uuid, bigint, jsonb, uuid, uuid) owner to app_executor;
alter function app.begin_job_revision_v1(uuid, uuid, bigint, uuid, uuid) owner to app_executor;
alter function app.duplicate_job_v1(uuid, bigint, uuid, uuid, uuid, uuid, uuid) owner to app_executor;
alter function app.preview_job_public_v1(uuid) owner to app_executor;
alter function app.publish_job_revision_v1(uuid, bigint, bigint, bytea, uuid, uuid) owner to app_executor;
alter function app.get_client_v1(uuid) owner to app_executor;
alter function app.get_job_workspace_v1(uuid) owner to app_executor;
alter function app.get_job_publication_v1(uuid) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
