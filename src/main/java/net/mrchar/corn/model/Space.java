package net.mrchar.corn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import net.mrchar.corn.model.base.AuditableEntity;

@Getter
@Entity
@Table(name = "space")
public class Space extends AuditableEntity {
    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    public Space() {
    }

    public Space(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
