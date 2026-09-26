let supabaseClient;
try {
    if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error('config.js missing SUPABASE_URL / SUPABASE_ANON_KEY');
    }
} catch (e) {
    console.error('Initialization error:', e);
}

function cloudApp() {
    return {
        loading: true,
        errorMessage: '',
        toastMessage: '',
        activeTab: 'schools',
        search: '',
        divisionFilter: '',
        interestFilter: '',
        majorFilter: '',
        newMajorName: '',
        athletes: [],
        selectedAthleteId: 1,
        currentAthlete: null,
        schools: [],
        divisions: [],
        interestLevels: [],
        allMajors: [],
        profileItems: [],
        profileSocials: [],
        profileContacts: [],
        profileTournaments: [],
        profileMajorIds: [],
        logs: [],
        schoolModalOpen: false,
        logModalOpen: false,
        editingId: null,
        schoolForm: { name: '', division: '', mascot: '', interest: 'High Interest', coaches: [], camps: [], selectedMajorIds: [] },
        logForm: { school_id: '', type: 'Email Sent', date: new Date().toISOString().split('T')[0], summary: '', details: '' },
        
        // Master Calendar State
        calendarYear: new Date().getFullYear(),
        calendarMonth: new Date().getMonth(),

        async init() {
            if (!supabaseClient) {
                this.errorMessage = 'Supabase client failed to initialize. Check config.js.';
                this.loading = false;
                return;
            }
            const { data: athData } = await supabaseClient.from('athletes').select('*').order('id');
            if (athData && athData.length > 0) {
                this.athletes = athData;
                this.selectedAthleteId = athData[0].id;
                this.currentAthlete = athData[0];
            }
            await this.fetchData();
        },

        async switchAthlete() {
            this.currentAthlete = this.athletes.find(a => String(a.id) === String(this.selectedAthleteId)) || this.currentAthlete;
            await this.fetchData();
        },

        async fetchData() {
            this.loading = true;
            this.errorMessage = '';

            const athId = this.selectedAthleteId;

            const { data: divisionsData } = await supabaseClient.from('divisions').select('*').order('name');
            if (divisionsData) this.divisions = divisionsData;

            const { data: interestData } = await supabaseClient.from('interest_levels').select('*').order('name');
            if (interestData) this.interestLevels = interestData;

            const { data: majorsData } = await supabaseClient.from('majors').select('*').order('name');
            if (majorsData) this.allMajors = majorsData;

            const { data: profileData } = await supabaseClient.from('player_profile').select('*').eq('athlete_id', athId).order('display_order');
            if (profileData) this.profileItems = profileData;

            const { data: socialsData } = await supabaseClient.from('player_profile_socials').select('*').eq('athlete_id', athId).order('display_order');
            if (socialsData) this.profileSocials = socialsData;

            const { data: contactsData } = await supabaseClient.from('player_profile_contacts').select('*').eq('athlete_id', athId).order('display_order');
            if (contactsData) this.profileContacts = contactsData;

            const { data: tournData } = await supabaseClient.from('player_profile_tournaments').select('*').eq('athlete_id', athId).order('display_order');
            if (tournData) this.profileTournaments = tournData;

            const { data: athMajors } = await supabaseClient.from('athlete_majors').select('major_id').eq('athlete_id', athId);
            if (athMajors) this.profileMajorIds = athMajors.map(am => am.major_id);

            const { data: schoolsData, error: schoolsError } = await supabaseClient
                .from('schools')
                .select('*, coaches(*), camps(*), school_majors(major_id, majors(id, name))')
                .order('name');

            if (schoolsError) {
                this.errorMessage = 'Database Error: ' + schoolsError.message;
            } else {
                this.schools = (schoolsData || []).map(s => {
                    const majorsList = s.school_majors ? s.school_majors.map(sm => sm.majors).filter(Boolean) : [];
                    return { ...s, majors: majorsList };
                });
                console.log('Loaded Schools & Camps Data:', this.schools); // Check DevTools console
            }

            const { data: logsData } = await supabaseClient.from('communication_logs').select('*').order('date', { ascending: false });
            if (logsData) this.logs = logsData;

            this.loading = false;
        },
        normalizeDate(dateVal) {
            if (!dateVal) return '';
            const clean = String(dateVal).trim().split('T')[0].split(' ')[0];
            const parts = clean.split(/[-/]/);
            if (parts.length === 3) {
                let y, m, d;
                if (parts[0].length === 4) { // YYYY-MM-DD or YYYY-M-D
                    y = parseInt(parts[0], 10);
                    m = parseInt(parts[1], 10);
                    d = parseInt(parts[2], 10);
                } else { // MM/DD/YYYY or M/D/YYYY
                    m = parseInt(parts[0], 10);
                    d = parseInt(parts[1], 10);
                    y = parseInt(parts[2], 10);
                }
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                }
            }
            return clean;
        },
        getMajorName(id) {
            const m = this.allMajors.find(item => String(item.id) === String(id));
            return m ? m.name : 'Unknown Major';
        },

        async updatePlayerMajors() {
            const athId = this.selectedAthleteId;
            await supabaseClient.from('athlete_majors').delete().eq('athlete_id', athId);
            if (this.profileMajorIds.length > 0) {
                const payload = this.profileMajorIds.map(mId => ({ athlete_id: athId, major_id: mId }));
                await supabaseClient.from('athlete_majors').insert(payload);
            }
            this.showToast('Intended majors updated');
        },

        async removeMajorSelection(mId) {
            this.profileMajorIds = this.profileMajorIds.filter(id => String(id) !== String(mId));
            await this.updatePlayerMajors();
        },

        async addNewMajor() {
            if (!this.newMajorName.trim()) return;
            const { data, error } = await supabaseClient.from('majors').insert([{ name: this.newMajorName.trim() }]).select().single();
            if (!error && data) {
                this.allMajors.push(data);
                this.profileMajorIds.push(data.id);
                await this.updatePlayerMajors();
                this.newMajorName = '';
                this.showToast('Added and assigned new major!');
            }
        },

        async updateProfileItem(item) {
            await supabaseClient.from('player_profile').update({ value: item.value }).eq('id', item.id);
            this.showToast(`Updated ${item.label}`);
        },

        async updateSocial(soc) {
            await supabaseClient.from('player_profile_socials').update({ handle: soc.handle }).eq('id', soc.id);
            this.showToast(`Updated ${soc.platform}`);
        },

        async updateContact(c) {
            await supabaseClient.from('player_profile_contacts').update({ team_or_org_name: c.team_or_org_name, contact_name: c.contact_name, email: c.email, phone: c.phone }).eq('id', c.id);
            this.showToast(`Updated ${c.role_title}`);
        },

        async updateTournament(t) {
            await supabaseClient.from('player_profile_tournaments').update({
                tournament_name: t.tournament_name,
                start_date: t.start_date || null,
                end_date: t.end_date || null,
                city: t.city,
                state: t.state
            }).eq('id', t.id);
            this.showToast('Tournament updated');
        },

        async addTournamentRow() {
            const { data, error } = await supabaseClient.from('player_profile_tournaments').insert([{
                athlete_id: this.selectedAthleteId,
                tournament_name: 'New Tournament',
                city: '',
                state: '',
                display_order: this.profileTournaments.length + 1
            }]).select().single();
            if (!error && data) {
                this.profileTournaments.push(data);
                this.showToast('Tournament added');
            }
        },

        async deleteTournament(id) {
            if (confirm('Delete this tournament?')) {
                await supabaseClient.from('player_profile_tournaments').delete().eq('id', id);
                this.profileTournaments = this.profileTournaments.filter(t => t.id !== id);
                this.showToast('Tournament deleted');
            }
        },

        copyToClipboard(text, label) {
            if (!text) {
                this.showToast('No value to copy!');
                return;
            }
            navigator.clipboard.writeText(text);
            this.showToast(`Copied ${label}!`);
        },

        showToast(msg) {
            this.toastMessage = msg;
            setTimeout(() => { this.toastMessage = ''; }, 2500);
        },

        get filteredSchools() {
            return this.schools.filter(s => {
                const nameMatch = s.name ? s.name.toLowerCase().includes(this.search.toLowerCase()) : false;
                const coachMatch = s.coaches ? s.coaches.some(c => c.name && c.name.toLowerCase().includes(this.search.toLowerCase())) : false;
                const matchSearch = nameMatch || coachMatch;
                const matchDiv = this.divisionFilter === '' || s.division === this.divisionFilter;
                const matchInterest = this.interestFilter === '' || s.interest === this.interestFilter;
                const matchMajor = this.majorFilter === '' || (s.majors && s.majors.some(m => String(m.name) === String(this.majorFilter)));
                return matchSearch && matchDiv && matchInterest && matchMajor;
            });
        },

        get sortedLogs() { return this.logs; },

        getSchoolName(id) {
            const sch = this.schools.find(s => s.id === id);
            return sch ? sch.name : 'Unknown School';
        },

        // Calendar Methods & Computed Properties
        get calendarMonthName() {
            const date = new Date(this.calendarYear, this.calendarMonth, 1);
            return date.toLocaleString('default', { month: 'long', year: 'numeric' });
        },

        changeMonth(direction) {
            this.calendarMonth += direction;
            if (this.calendarMonth > 11) {
                this.calendarMonth = 0;
                this.calendarYear++;
            } else if (this.calendarMonth < 0) {
                this.calendarMonth = 11;
                this.calendarYear--;
            }
        },

        resetToCurrentMonth() {
            const now = new Date();
            this.calendarYear = now.getFullYear();
            this.calendarMonth = now.getMonth();
        },

        get calendarDays() {
            const year = this.calendarYear;
            const month = this.calendarMonth;
            
            const firstDayIndex = new Date(year, month, 1).getDay();
            const totalDays = new Date(year, month + 1, 0).getDate();
            const prevTotalDays = new Date(year, month, 0).getDate();

            // Calculate current date string in local YYYY-MM-DD format
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            let days = [];

            // Helper to format date strictly as YYYY-MM-DD
            const formatDateStr = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            // Previous month trailing days
            for (let i = firstDayIndex - 1; i >= 0; i--) {
                let dNum = prevTotalDays - i;
                let prevMonth = month === 0 ? 11 : month - 1;
                let prevYear = month === 0 ? year - 1 : year;
                days.push({ 
                    dayNumber: dNum, 
                    dateStr: formatDateStr(prevYear, prevMonth, dNum), 
                    isCurrentMonth: false, 
                    isToday: false, 
                    tournaments: [], 
                    camps: [] 
                });
            }

            // Current month days
            for (let i = 1; i <= totalDays; i++) {
                let dateStr = formatDateStr(year, month, i);
                days.push({ 
                    dayNumber: i, 
                    dateStr: dateStr, 
                    isCurrentMonth: true, 
                    isToday: dateStr === todayStr, 
                    tournaments: [], 
                    camps: [] 
                });
            }

            // Next month leading days to complete grid
            let remainingCells = 7 - (days.length % 7);
            if (remainingCells < 7) {
                for (let i = 1; i <= remainingCells; i++) {
                    let nextMonth = month === 11 ? 0 : month + 1;
                    let nextYear = month === 11 ? year + 1 : year;
                    days.push({ 
                        dayNumber: i, 
                        dateStr: formatDateStr(nextYear, nextMonth, i), 
                        isCurrentMonth: false, 
                        isToday: false, 
                        tournaments: [], 
                        camps: [] 
                    });
                }
            }

            // Map tournaments to days (string-based range comparison to avoid UTC shifts)
            if (Array.isArray(this.profileTournaments)) {
                this.profileTournaments.forEach(t => {
                    if (!t.start_date) return;
                    const startStr = String(t.start_date).split('T')[0].trim();
                    const endStr = t.end_date ? String(t.end_date).split('T')[0].trim() : startStr;
                    
                    days.forEach(day => {
                        if (day.dateStr >= startStr && day.dateStr <= endStr) {
                            day.tournaments.push(t);
                        }
                    });
                });
            }

            // Map camps to days (normalizing camp_date format)
            if (Array.isArray(this.schools)) {
                this.schools.forEach(s => {
                    if (Array.isArray(s.camps) && s.camps.length > 0) {
                        s.camps.forEach(c => {
                            if (!c.camp_date) return;
                            // Clean timestamp/time strings down to pure YYYY-MM-DD
                            const campDateStr = String(c.camp_date).split('T')[0].split(' ')[0].trim();
                            
                            days.forEach(day => {
                                if (day.dateStr === campDateStr) {
                                    day.camps.push({ ...c, schoolName: s.name });
                                }
                            });
                        });
                    }
                });
            }

            return days;
        },

        openSchoolModal() {
            this.editingId = null;
            this.schoolForm = { name: '', division: '', mascot: '', interest: 'High Interest', coaches: [], camps: [], selectedMajorIds: [] };
            this.schoolModalOpen = true;
        },

        editSchool(school) {
            this.editingId = school.id;
            this.schoolForm = {
                name: school.name,
                division: school.division,
                mascot: school.mascot,
                interest: school.interest || 'High Interest',
                coaches: school.coaches ? JSON.parse(JSON.stringify(school.coaches)) : [],
                camps: school.camps ? JSON.parse(JSON.stringify(school.camps)) : [],
                selectedMajorIds: school.majors ? school.majors.map(m => m.id) : []
            };
            this.schoolModalOpen = true;
        },

        addCoachRow() {
            this.schoolForm.coaches.push({ name: '', role: 'Coach', email: '' });
        },

        removeCoachRow(idx) {
            this.schoolForm.coaches.splice(idx, 1);
        },

        addCampRow() {
            this.schoolForm.camps.push({ name: 'Prospect Camp', camp_date: '' });
        },

        removeCampRow(idx) {
            this.schoolForm.camps.splice(idx, 1);
        },

        async saveSchool() {
            this.loading = true;
            let schoolId = this.editingId;

            if (schoolId) {
                await supabaseClient.from('schools').update({
                    name: this.schoolForm.name,
                    division: this.schoolForm.division,
                    mascot: this.schoolForm.mascot,
                    interest: this.schoolForm.interest
                }).eq('id', schoolId);
            } else {
                const { data } = await supabaseClient.from('schools').insert([{
                    name: this.schoolForm.name,
                    division: this.schoolForm.division,
                    mascot: this.schoolForm.mascot,
                    interest: this.schoolForm.interest
                }]).select().single();
                if (data) schoolId = data.id;
            }

            if (schoolId) {
                await supabaseClient.from('coaches').delete().eq('school_id', schoolId);
                if (this.schoolForm.coaches.length > 0) {
                    const coachPayload = this.schoolForm.coaches.map(c => ({ school_id: schoolId, name: c.name, role: c.role, email: c.email }));
                    await supabaseClient.from('coaches').insert(coachPayload);
                }

                await supabaseClient.from('camps').delete().eq('school_id', schoolId);
                if (this.schoolForm.camps.length > 0) {
                    const campPayload = this.schoolForm.camps.map(c => ({ school_id: schoolId, name: c.name, camp_date: c.camp_date }));
                    await supabaseClient.from('camps').insert(campPayload);
                }

                await supabaseClient.from('school_majors').delete().eq('school_id', schoolId);
                if (this.schoolForm.selectedMajorIds.length > 0) {
                    const majorPayload = this.schoolForm.selectedMajorIds.map(mId => ({ school_id: schoolId, major_id: mId }));
                    await supabaseClient.from('school_majors').insert(majorPayload);
                }
            }

            this.schoolModalOpen = false;
            await this.fetchData();
        },

        async deleteSchool(id) {
            if (confirm('Delete this program and all associated details?')) {
                await supabaseClient.from('schools').delete().eq('id', id);
                await this.fetchData();
            }
        },

        openLogModal() {
            this.logForm = { school_id: '', type: 'Email Sent', date: new Date().toISOString().split('T')[0], summary: '', details: '' };
            this.logModalOpen = true;
        },

        async saveLog() {
            await supabaseClient.from('communication_logs').insert([this.logForm]);
            this.logModalOpen = false;
            await this.fetchData();
        },

        async deleteLog(id) {
            await supabaseClient.from('communication_logs').delete().eq('id', id);
            await this.fetchData();
        },

        exportCSV() {
            let csv = 'College,Division,Mascot,Interest,Majors,Coaches,Camps\n';
            this.schools.forEach(s => {
                const majorNames = s.majors ? s.majors.map(m => m.name).join('; ') : '';
                const coachNames = s.coaches ? s.coaches.map(c => `${c.name} (${c.role || 'Coach'})`).join('; ') : '';
                const campDates = s.camps ? s.camps.map(c => `${c.name || 'Camp'}: ${c.camp_date}`).join('; ') : '';
                csv += `"${s.name}","${s.division || ''}","${s.mascot || ''}","${s.interest || ''}","${majorNames}","${coachNames}","${campDates}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', 'frankie_recruiting_contacts.csv');
            a.click();
        }
    }
}