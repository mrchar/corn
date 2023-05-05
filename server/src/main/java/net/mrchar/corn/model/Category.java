package net.mrchar.corn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import net.mrchar.corn.model.base.AuditableEntity;

@Getter
@Entity
@Table(name = "category")
public class Category extends AuditableEntity {
    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @Column(name = "unit")
    private String unit;

    public Category() {
    }

    public Category(String code, String name, String unit) {
        this.code = code;
        this.name = name;
        this.unit = unit;
    }
}
