    <script>
        // Check Login Status
        const token = localStorage.getItem('adminToken');
        if (!token) {
            window.location.href = '/login.html';
        } else {
            // Verify token with backend
            fetch('/api/verify-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            }).then(res => {
                if (!res.ok) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/login.html';
                } else {
                    loadEventsList();
                }
            }).catch(() => {
                // If backend is down, keep them here or handle gracefully
            });
        }

        function logout() {
            localStorage.removeItem('adminToken');
            window.location.href = '/login.html';
        }

        async function loadEventsList() {
            try {
                const response = await fetch('/api/events');
                const data = await response.json();
                const tbody = document.getElementById('events-tbody');
                
                if (data.status === 'success') {
                    tbody.innerHTML = '';
                    data.events.forEach(evt => {
                        const isDefault = evt.id === 'audric-cathrine';
                        const isActive = evt.status === 'active';
                        
                        const statusBadge = isActive
                            ? `<span style="color: var(--success); font-weight: 600;">● Active</span>`
                            : `<span style="color: var(--danger); font-weight: 600;">● Inactive</span>`;
                            
                        const renameBtn = isDefault
                            ? `<button class="btn" style="background: #e4e6ef; color: #a1a5b7; padding: 6px 12px; font-size: 12px; border-radius: 6px; opacity: 0.5; cursor: not-allowed;" disabled>✏️ Rename</button>`
                            : `<button onclick="renameEvent('${evt.id}')" class="btn" style="background: #e4e6ef; color: #3f4254; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">✏️ Rename</button>`;
                            
                        const toggleBtn = isActive
                            ? `<button onclick="toggleEventStatus('${evt.id}', 'inactive')" class="btn" style="background: #fff8dd; color: #ffc700; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">🛑 Deactivate</button>`
                            : `<button onclick="toggleEventStatus('${evt.id}', 'active')" class="btn" style="background: #e8fff3; color: #50cd89; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">✅ Activate</button>`;
                            
                        const deleteBtn = isDefault
                            ? `<button class="btn" style="background: #ffe2e5; color: #f1416c; padding: 6px 12px; font-size: 12px; border-radius: 6px; opacity: 0.5; cursor: not-allowed;" disabled>🗑️ Delete</button>`
                            : `<button onclick="deleteEvent('${evt.id}')" class="btn" style="background: #ffe2e5; color: #f1416c; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">🗑️ Delete</button>`;

                        tbody.innerHTML += `
                            <tr>
                                <td><span class="badge" style="font-size: 14px; padding: 6px 12px;">${evt.id}</span></td>
                                <td>${statusBadge}</td>
                                <td>
                                    <div class="action-btns" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                        <a href="/config.html?event=${evt.id}" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;">⚙️ Config</a>
                                        ${renameBtn}
                                        ${toggleBtn}
                                        ${deleteBtn}
                                        <a href="/?event=${evt.id}" target="_blank" class="btn btn-success" style="background: #e1f0ff; color: #009ef7; padding: 6px 12px; font-size: 12px; border-radius: 6px; text-decoration: none;">🔗 Open Booth</a>
                                        <a href="/gallery.html?event=${evt.id}" target="_blank" class="btn" style="background: #e1f0ff; color: #009ef7; padding: 6px 12px; font-size: 12px; border-radius: 6px; text-decoration: none;">🖼️ Gallery</a>
                                    </div>
                                </td>
                            </tr>
                        `;
                    });
                }
            } catch (error) {
                console.error("Error loading events", error);
            }
        }

        async function toggleEventStatus(eventId, newStatus) {
            try {
                const res = await fetch('/api/events/toggle-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId, status: newStatus })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    loadEventsList();
                } else {
                    alert('Failed to update status: ' + data.message);
                }
            } catch (e) {
                alert('Failed to connect to server.');
            }
        }

        async function deleteEvent(eventId) {
            if (!confirm(`Are you sure you want to delete event "${eventId}"?\n\nThis will also permanently delete all guest session photos/videos for this event!`)) {
                return;
            }
            try {
                const res = await fetch('/api/events/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    alert(`Event "${eventId}" successfully deleted!`);
                    loadEventsList();
                } else {
                    alert('Failed to delete event: ' + data.message);
                }
            } catch (e) {
                alert('Failed to connect to server.');
            }
        }

        async function renameEvent(eventId) {
            const newName = prompt(`Enter a new name/slug for event "${eventId}":\n(Use lowercase letters, numbers, and hyphens only)`, eventId);
            if (newName === null) return; // Cancelled
            const cleanNewId = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            if (!cleanNewId) {
                alert('Invalid new event name!');
                return;
            }
            if (cleanNewId === eventId) return;

            try {
                const res = await fetch('/api/events/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId, newEventId: cleanNewId })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    alert(`Event successfully renamed to "${data.newEventId}"!`);
                    loadEventsList();
                } else {
                    alert('Failed to rename event: ' + data.message);
                }
            } catch (e) {
                alert('Failed to connect to server.');
            }
        }

        async function createNewEvent() {
            const input = document.getElementById('new-event-id');
            const eventNameRaw = input.value.trim();
            if (!eventNameRaw) {
                alert('Please enter an event name first!');
                return;
            }

            const slug = eventNameRaw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            if (!slug) {
                alert('Invalid event name! Use letters, numbers, and hyphens (-) only.');
                return;
            }

            try {
                const res = await fetch('/api/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: slug })
                });

                const data = await res.json();
                if (data.status === 'success') {
                    input.value = '';
                    alert(`Event "${data.eventId}" successfully created!`);
                    loadEventsList();
                } else {
                    alert('Error: ' + data.message);
                }
            } catch (err) {
                alert('Failed to connect to server.');
            }
        }
    </script>
