import { useEffect, useState } from "react";

export default function OwnerSettingsTeam() {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    // Fetch employees from API
    fetch("/api/v1/auth/employee").then((res) => res.json()).then(setEmployees);
  }, []);

  return (
    <div>
      <h2>Управление сотрудниками</h2>
      <button onClick={() => alert("Add employee functionality will be here")}>+ Add Employee</button>
      <ul>
        {employees.map((employee) => (
          <li key={employee.user_id}>{employee.full_name} - {employee.email}</li>
        ))}
      </ul>
    </div>
  );
}
