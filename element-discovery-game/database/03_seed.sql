-- =====================================================================
-- Element Discovery Game  -  03_seed.sql  (reference + game content)
-- =====================================================================

INSERT INTO role (role_name, description) VALUES
  ('Player',    'Regular player'),
  ('Admin',     'Full access to the admin panel'),
  ('Moderator', 'Can manage elements and recipes');

INSERT INTO category (category_name, description, icon_url) VALUES
  ('Nature',   'Natural phenomena, plants and creatures', '🌿'),
  ('Tech',     'Metals, machines and technology',         '⚙️'),
  ('Mythical', 'Legendary beings and artefacts',          '🐉'),
  ('Abstract', 'Ideas, forces and concepts',              '✨');

-- elements are loaded through a temp table so categories can be referenced by name
CREATE TEMPORARY TABLE tmp_element (name VARCHAR(60), descr VARCHAR(255), icon VARCHAR(10), rarity VARCHAR(12), cat VARCHAR(50));
INSERT INTO tmp_element VALUES
 ('Fire','The first spark.','🔥','Common','Nature'),
 ('Water','Fluid and patient.','💧','Common','Nature'),
 ('Earth','Solid ground beneath you.','🌍','Common','Nature'),
 ('Air','Invisible, but everywhere.','💨','Common','Nature'),
 ('Steam','Water that remembers fire.','♨️','Common','Nature'),
 ('Mud','Earth soaked through.','🟤','Common','Nature'),
 ('Lava','Molten rock.','🌋','Common','Nature'),
 ('Dust','Fine grains carried by the wind.','🌫️','Common','Nature'),
 ('Energy','Raw power waiting to be used.','⚡','Common','Abstract'),
 ('Lake','Still water in a hollow.','🏞️','Common','Nature'),
 ('Mountain','Earth piled to the sky.','⛰️','Common','Nature'),
 ('Inferno','Fire feeding on itself.','🔥','Common','Nature'),
 ('Cloud','Steam gathered high.','☁️','Common','Nature'),
 ('Rain','Water falling from clouds.','🌧️','Common','Nature'),
 ('Plant','Life reaching for light.','🌱','Common','Nature'),
 ('Tree','A plant that kept growing.','🌳','Common','Nature'),
 ('Forest','Many trees together.','🌲','Common','Nature'),
 ('Stone','Cooled lava.','🪨','Common','Nature'),
 ('Metal','Stone refined by fire.','🔩','Common','Tech'),
 ('Electricity','Energy running through metal.','🔌','Uncommon','Tech'),
 ('Machine','Metal given purpose.','⚙️','Uncommon','Tech'),
 ('Life','The spark in the mud.','🧬','Uncommon','Nature'),
 ('Animal','Life walking the earth.','🐾','Uncommon','Nature'),
 ('Bird','Life taking to the air.','🐦','Uncommon','Nature'),
 ('Fish','Life in the water.','🐟','Uncommon','Nature'),
 ('Human','An animal with a spark of mind.','🧑','Uncommon','Nature'),
 ('Sun','A star burning overhead.','☀️','Uncommon','Nature'),
 ('Rainbow','Light splitting through rain.','🌈','Uncommon','Nature'),
 ('Storm','Clouds charged with electricity.','⛈️','Uncommon','Nature'),
 ('Gold','Metal that shines like the sun.','🪙','Uncommon','Tech'),
 ('Love','What humans make together.','❤️','Uncommon','Abstract'),
 ('Idea','A thought lit by electricity.','💡','Uncommon','Abstract'),
 ('Robot','A machine with life in it.','🤖','Rare','Tech'),
 ('Computer','Electricity thinking.','💻','Rare','Tech'),
 ('Time','Dust settling under the sun.','⏳','Rare','Abstract'),
 ('Chaos','Energy inside a storm.','🌀','Rare','Abstract'),
 ('Unicorn','An animal touched by a rainbow.','🦄','Rare','Mythical'),
 ('Mermaid','Half fish, half human.','🧜','Rare','Mythical'),
 ('Golem','Stone brought to life.','🗿','Rare','Mythical'),
 ('Ghost','A human made of air.','👻','Rare','Mythical'),
 ('Wizard','A human who bends energy.','🧙','Rare','Mythical'),
 ('Dragon','Lava given wings.','🐉','Legendary','Mythical'),
 ('Phoenix','Fire reborn as a bird.','🦅','Legendary','Mythical'),
 ('Philosopher''s Stone','Gold perfected by a wizard.','💎','Legendary','Mythical'),
 ('AI','A robot with ideas.','🧠','Legendary','Tech');

INSERT INTO element (name, description, icon_url, rarity, category_id)
SELECT t.name, t.descr, t.icon, t.rarity, c.category_id
  FROM tmp_element t JOIN category c ON c.category_name = t.cat;

CREATE TEMPORARY TABLE tmp_tag (name VARCHAR(60), tag VARCHAR(30));
INSERT INTO tmp_tag VALUES
 ('Fire','starter'),('Water','starter'),('Earth','starter'),('Air','starter'),
 ('Fire','hot'),('Lava','hot'),('Inferno','hot'),('Sun','hot'),('Steam','hot'),
 ('Water','liquid'),('Rain','liquid'),('Lake','liquid'),
 ('Air','gas'),('Steam','gas'),('Cloud','gas'),
 ('Human','living'),('Animal','living'),('Bird','living'),('Fish','living'),('Plant','living'),('Tree','living'),
 ('Dragon','legend'),('Phoenix','legend'),('Unicorn','legend'),('Mermaid','legend'),
 ('Machine','invention'),('Robot','invention'),('Computer','invention'),('AI','invention');
INSERT INTO element_tag (element_id, tag) SELECT e.element_id, t.tag FROM tmp_tag t JOIN element e ON e.name = t.name;

-- recipes (pair order does not matter here: it is normalised with LEAST/GREATEST)
CREATE TEMPORARY TABLE tmp_recipe (a VARCHAR(60), b VARCHAR(60), r VARCHAR(60), d INT, x INT);
INSERT INTO tmp_recipe VALUES
 ('Fire','Water','Steam',1,10),('Earth','Water','Mud',1,10),('Fire','Earth','Lava',1,10),
 ('Air','Earth','Dust',1,10),('Air','Fire','Energy',1,10),('Water','Water','Lake',1,10),
 ('Earth','Earth','Mountain',1,10),('Fire','Fire','Inferno',1,10),
 ('Steam','Air','Cloud',2,15),('Cloud','Water','Rain',2,15),('Rain','Earth','Plant',2,15),
 ('Plant','Earth','Tree',2,15),('Tree','Tree','Forest',2,20),('Lava','Water','Stone',2,15),
 ('Stone','Fire','Metal',2,20),('Metal','Energy','Electricity',3,25),('Electricity','Metal','Machine',3,30),
 ('Mud','Energy','Life',3,30),('Life','Earth','Animal',3,25),('Life','Air','Bird',3,25),
 ('Life','Water','Fish',3,25),('Animal','Energy','Human',3,35),('Machine','Life','Robot',4,40),
 ('Inferno','Air','Sun',3,30),('Rain','Sun','Rainbow',3,30),('Cloud','Electricity','Storm',3,30),
 ('Lava','Bird','Dragon',4,50),('Fire','Bird','Phoenix',4,60),('Animal','Rainbow','Unicorn',4,50),
 ('Fish','Human','Mermaid',4,45),('Stone','Life','Golem',4,45),('Human','Air','Ghost',4,45),
 ('Human','Energy','Wizard',4,50),('Metal','Sun','Gold',3,35),('Gold','Wizard','Philosopher''s Stone',5,100),
 ('Sun','Dust','Time',4,50),('Human','Human','Love',3,40),('Human','Electricity','Idea',3,40),
 ('Storm','Energy','Chaos',4,50),('Electricity','Idea','Computer',4,50),('Robot','Idea','AI',5,90);

INSERT INTO recipe (element1_id, element2_id, result_element_id, difficulty, xp_reward)
SELECT LEAST(ea.element_id, eb.element_id), GREATEST(ea.element_id, eb.element_id), er.element_id, t.d, t.x
  FROM tmp_recipe t
  JOIN element ea ON ea.name = t.a
  JOIN element eb ON eb.name = t.b
  JOIN element er ON er.name = t.r;

INSERT INTO challenge (title, description, challenge_type, target_value, xp_reward, start_date, end_date) VALUES
 ('First Steps',      'Make 3 discoveries.',                   'DISCOVER_COUNT',  3,  30,  NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 365 DAY),
 ('Weekly Explorer',  'Make 15 discoveries this season.',      'DISCOVER_COUNT', 15, 120,  NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 365 DAY),
 ('Pioneer',          'Be the first player to find any element.', 'FIRST_DISCOVERY', 1, 75, NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 365 DAY),
 ('Arena Initiate',   'Win 1 fusion battle.',                  'BATTLE_WIN',      1,  60,  NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 365 DAY),
 ('Gladiator',        'Win 3 fusion battles.',                 'BATTLE_WIN',      3, 200,  NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 365 DAY);

INSERT INTO achievement (name, description, requirement_type, requirement_value, xp_reward, icon_url) VALUES
 ('First Spark',     'Make your first discovery.',         'DISCOVERY_COUNT',       1,  20, '✨'),
 ('Apprentice',      'Make 10 discoveries.',               'DISCOVERY_COUNT',      10,  50, '📘'),
 ('Alchemist',       'Make 25 discoveries.',               'DISCOVERY_COUNT',      25, 100, '⚗️'),
 ('Grand Master',    'Make 40 discoveries.',               'DISCOVERY_COUNT',      40, 200, '👑'),
 ('Pathfinder',      'Make a first-ever discovery.',       'FIRST_DISCOVERY_COUNT', 1,  50, '🚩'),
 ('Rare Collector',  'Own 3 Rare or Legendary elements.',  'RARE_COUNT',            3,  75, '💎'),
 ('Victor',          'Win a fusion battle.',               'BATTLE_WINS',           1,  50, '🏆'),
 ('Champion',        'Win 5 fusion battles.',              'BATTLE_WINS',           5, 150, '🥇');

DROP TEMPORARY TABLE tmp_element;
DROP TEMPORARY TABLE tmp_tag;
DROP TEMPORARY TABLE tmp_recipe;
